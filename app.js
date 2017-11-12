/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  Shopify = require('shopify-api-node'),
  mongoose = require('mongoose'),
  Product = require('./models/products');


const _ = require('lodash');
var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));



mongoose.connect('mongodb://kayleoss:goodboy114@ds259305.mlab.com:59305/messenger-bot');

/*
 * Open config/default.json and set your config values before running this code. 
 * You can also set them using environment variables.
 *
 */

// App Secret can be retrieved from the App Dashboard
const FB_APP_SECRET = (process.env.FB_APP_SECRET) ?
  process.env.FB_APP_SECRET :
  config.get('fb_appSecret');

// Arbitrary value used to validate a webhook
const FB_VALIDATION_TOKEN = (process.env.FB_VALIDATION_TOKEN) ?
  (process.env.FB_VALIDATION_TOKEN) :
  config.get('fb_validationToken');

// Generate a page access token for your page from the App Dashboard
const FB_PAGE_ACCESS_TOKEN = (process.env.FB_PAGE_ACCESS_TOKEN) ?
  (process.env.FB_PAGE_ACCESS_TOKEN) :
  config.get('fb_pageAccessToken');

const SHOPIFY_SHOP_NAME = (process.env.SHOP_NAME) ?
  process.env.SHOP_NAME :
  config.get('sh_shopName');

const SHOPIFY_API_KEY = (process.env.SHOP_API_KEY) ?
  process.env.SHOP_API_KEY :
  config.get('sh_apiKey');

const SHOPIFY_API_PASSWORD = (process.env.SHOP_API_PASSWORD) ?
  process.env.SHOP_API_PASSWORD :
  config.get('sh_apiPassword');

const HOST_URL = (process.env.HOST_URL) ?
  process.env.HOST_URL :
  config.get('host_url');

// make sure that everything has been properly configured
if (!(FB_APP_SECRET && FB_VALIDATION_TOKEN && FB_PAGE_ACCESS_TOKEN && SHOPIFY_SHOP_NAME && SHOPIFY_API_KEY && SHOPIFY_API_PASSWORD && HOST_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_NAME,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD
});

const product_tag_keywords = [];

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * your App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // In DEV, log an error. In PROD, throw an error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
      .update(buf)
      .digest('hex');

    //console.log("signatureHash: " + signatureHash);
    //console.log("expectedHash: " + expectedHash);

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function (req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VALIDATION_TOKEN) {
    // console.log("[app.get] Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/**
 * serves a static page for the webview
 */
app.get('/product_description', function (req, res) {
  var product_id = req.query['id'];
  if (product_id !== 'null') {
    // console.log("[app.get] product id:" + product_id);
    var sh_product = shopify.product.get(product_id);
    sh_product.then(function (product) {
      // console.log(product.options[0].values);
      res.status(200).send(product.body_html);
    }, function (error) {
      console.error("Error retrieving product");
      res.sendStatus(400).send("Error retrieving product");
    });

  } else {
    console.error("Product id is required");
    res.sendStatus(400).send("Product id is required");
  }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  // You must send back a status 200 to let the Messenger Platform know that you've
  // received the callback. Do that right away because the countdown doesn't stop when 
  // you're paused on a breakpoint! Otherwise, the request might time out. 
  res.sendStatus(200);

  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // entries may be batched so iterate over each one
    data.entry.forEach(function (pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // iterate over each messaging event
      pageEntry.messaging.forEach((messagingEvent) => {

        let propertyNames = [];
        for (var prop in messagingEvent) { propertyNames.push(prop) }
        // console.log("[app.post] Webhook received a messagingEvent with properties: ", propertyNames.join());
        if (messagingEvent.message) {
          // someone sent a message
          receivedMessage(messagingEvent);

        } else if (messagingEvent.delivery) {
          // messenger platform sent a delivery confirmation
          receivedDeliveryConfirmation(messagingEvent);

        } else if (messagingEvent.postback) {
          // user replied by tapping one of our postback buttons
          receivedPostback(messagingEvent);

        } else {
          // console.log("[app.post] Webhook is not prepared to handle this message.");

        }
      });
    });
  }
});

//POPULATE DATABASE WITH SHOPIFY JSON FILE 
// var products_url = 'https://52e82a861b0ca05d7541b01262a0da34:4cf5481969535398711eaba9d3b63ea0@dev-circle-toronto-hackathon.myshopify.com/admin/products.json';
shopify.product.list().then(
  (product_list) => {
    product_list.forEach(function (element) {
      _.split(element.tags.toLowerCase(), ', ').forEach(function (key) {
        if (product_tag_keywords.indexOf(key) == -1) {
          product_tag_keywords.push(key);
        }
      });
      Product.find({ 'id': element.id }, function (err, found) {
        if (!found) {
          var newProduct = {
            id: element.id,
            title: element.title,
            image_src: element.images[0].src,
            product_type: element.product_type,
            tags: _.split(element.tags.toLowerCase(), ', '),
            handle: element.handle
          };

          Product.create(newProduct, function (err, newProduct) {
            if (err) {
              console.log(err);
            } else {

              // console.log(newProduct);
            }
          })
        }
      }
      )

    }
    )
  }
)

const sectionButton = function (title, action, options) {
  var payload = options | {};
  payload = Object.assign(options, { action: action });
  return {
    type: 'postback',
    title: title,
    payload: JSON.stringify(payload)
  };
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 * 
 */
function receivedMessage(event) {
  // console.log(event)
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  var options = {
    host: 'graph.facebook.com',
    method: 'GET',
    path: '/v2.6/' + senderID + '?fields=first_name,last_name,profile_pic&access_token=' + FB_PAGE_ACCESS_TOKEN
  };
  const ShopUrl = "https://52e82a861b0ca05d7541b01262a0da34:4cf5481969535398711eaba9d3b63ea0@dev-circle-toronto-hackathon.myshopify.com/admin/shop.json";

  // console.log("[receivedMessage] user (%d) page (%d) timestamp (%d) and message (%s)",
  // senderID, pageID, timeOfMessage, JSON.stringify(message));



  if (message.quick_reply) {
    // console.log("[receivedMessage] quick_reply.payload (%s)",
    // message.quick_reply.payload);
    handleQuickReplyResponse(event);
    return;
  }

  var messageText = message.text;

  if (messageText) {

    var intent = firstEntity(message.nlp, 'intent');

    // if (intent && intent.confidence > 0.8 && intent.value == 'product_get') {
    //   sendHelpOptionsAsButtonTemplates(senderID);
    // }
    if (intent && intent.confidence > 0.8 && intent.value == 'location_get') {
      shopify.location.list().then(
        (location) => {
          // console.log(location);
          sendTextMessage(senderID, 'We are at ' + location[0].address1 + " " + location[0].address2 + " " + location[0].city);
        });
    }
    if (intent && intent.confidence > 0.5 && intent.value == 'phone_get') {

      shopify.location.list().then(
        (location) => {
          // console.log(location);
          sendPhoneNumberAsButton(senderID, location[0].phone);
        });
    }
    if (intent && intent.confidence > 0.8 && intent.value == 'help_get') {
      sendHelpOptionsAsButtonTemplates(senderID);
    }

    const greetings = firstEntity(message.nlp, 'greetings');
    if (greetings && greetings.confidence > 0.8) {
      const get_info = request('https://graph.facebook.com/v2.6/' + senderID + '?&access_token=' + FB_PAGE_ACCESS_TOKEN, function (error, response, body) {
        var data = JSON.parse(body);
        sendTextMessage(senderID, 'Hey ' + data.first_name + '! :) \n\
Welcome to CandyBoxx! \nWe offer the best and brightest in fashion!👚👗👙💄💋 \n\
How can I help you today?');
      });
    }

    const product_get = firstEntity(message.nlp, 'product_get');
    if (intent && intent.confidence > 0.8 && intent.value == 'product_get') {

      var keys = search_product_key(messageText);
      if (keys) {
        Product.find({ 'tags': { $in: keys } }, null, { limit: 5 }, function (err, foundProducts) {
          if (err) {
            console.log(err);
          } else {
            var templateElements = [];
            const sendProducts = foundProducts.forEach(function (product) {
              var url = 'https://dev-circle-toronto-hackathon.myshopify.com/products/' + product.handle;
              templateElements.push({
                title: product.title,
                subtitle: product.tags.toString(),
                image_url: product.image_src,
                buttons: [
                  sectionButton('See options', 'QR_GET_PRODUCT_OPTIONS', { id: product.id }),
                  {
                    "type": "web_url",
                    "url": url,
                    "title": "View the web Page",
                  },
                ]
              });
            });

            var messageData = {
              recipient: {
                id: senderID
              },
              message: {
                attachment: {
                  type: "template",
                  payload: {
                    template_type: "generic",
                    elements: templateElements
                  }
                }
              }
            };

            callSendAPI(messageData);


          }
        });
      }
      else {
        sendHelpOptionsAsButtonTemplates(senderID);
      }
    }

  }

}
// const product_get = firstEntity(message.nlp, 'product_get');
// if (product_get && product_get.confidence > 0.8) {
//   function search_product_key(messageText) {
//     var keywords = ['dress', 'pants', 'leggings'];
//     keywords.forEach(function (keys) {
//       if (messageText.search(keys) > 0) {
//         return keys;
//       }
//     })
//     if (keys) {
//       Product.find({ 'tags': keys }, function (err, foundProducts) {
//         if (!err) {
//           console.log(err);
//         } else {
//           const sendProducts = foundProducts.forEach(function (product) {
//             return 'https://dev-circle-toronto-hackathon.myshopify.com/products/' + product.handle;
//           });
//           sendTextMessage(senderID, sendProducts);
//         }
//       });
//     }
//   }
// }

// switch (messageText) {
//   // if the text matches any special keywords, handle them accordingly
//   case 'help':
//     sendHelpOptionsAsButtonTemplates(senderID);
//     break;

//   default:
//     // otherwise, just echo it back to the sender
//     sendTextMessage(senderID, JSON.stringify(message));

// }



//SHOP API

function sendPhoneNumberAsButton(recepientID, phoneNumber) {
  // console.log("[sendPhoneNumberAsButton] Sending the help options menu");
  var messageData = {
    recipient: {
      id: recepientID
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Phone number is " + phoneNumber + " . Click the button to call us",
          buttons: [
            {
              "type": "phone_number",
              "title": phoneNumber,
              "payload": phoneNumber
            }
          ]
        }
      }
    }

  };

  callSendAPI(messageData);

}

/*
 * Send a message with buttons.
 *
 */
function sendHelpOptionsAsButtonTemplates(recipientId) {
  // console.log("[sendHelpOptionsAsButtonTemplates] Sending the help options menu");
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Click the button before to get a list of 5 of our products.",
          buttons: [
            {
              "type": "postback",
              "title": "Get 5 products",
              "payload": JSON.stringify({ action: 'QR_GET_PRODUCT_LIST', limit: 5 })
            }
            // limit of three buttons 
          ]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Someone tapped one of the Quick Reply buttons so 
 * respond with the appropriate content
 *
 */
function handleQuickReplyResponse(event) {
  // console.log( " [handleQuickReplyResponse]", event);
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var message = event.message;
  var quickReplyPayload = message.quick_reply.payload;

  // console.log("[handleQuickReplyResponse] Handling quick reply response (%s) from sender (%d) to page (%d) with message (%s)",
  // quickReplyPayload, senderID, pageID, JSON.stringify(message));

  // use branched conversation with one interaction per feature (each of which contains a variable number of content pieces)
  respondToHelpRequestWithTemplates(senderID, quickReplyPayload);

}

/*
 * This response uses templateElements to present the user with a carousel
 * You send ALL of the content for the selected feature and they can 
 * swipe from side to side to see it
 *
 */
function respondToHelpRequestWithTemplates(recipientId, requestForHelpOnFeature) {
  // console.log("[respondToHelpRequestWithTemplates] handling help request for %s",
  // requestForHelpOnFeature);
  var templateElements = [];

  var requestPayload = JSON.parse(requestForHelpOnFeature);


  var textButton = function (title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, { action: action });
    return {
      "content_type": "text",
      title: title,
      payload: JSON.stringify(payload)
    };
  }

  switch (requestPayload.action) {
    case 'QR_GET_PRODUCT_LIST':
      var products = shopify.product.list({ limit: requestPayload.limit });


      products.then(function (listOfProducts) {
        var prod = JSON.stringify(listOfProducts);
        var random1 = prod[_.random(0, prod.length)];

        console.log(prod[0]);

        // console.log(prod[0]);

        listOfProducts.forEach((product) => {
          // console.log(product);
          var url = HOST_URL + "/product.html?id=" + product.id;
          var url2 = "https://dev-circle-toronto-hackathon.myshopify.com/products/" + product.handle;
          // console.log(url2);

          templateElements.push({
            title: product.title,
            subtitle: product.tags,
            image_url: product.image.src,
            buttons: [
              {
                "type": "web_url",
                "url": url,
                "title": "Read description",
                "webview_height_ratio": "compact",
                "messenger_extensions": "true"
              },
              sectionButton('See options', 'QR_GET_PRODUCT_OPTIONS', { id: product.id }),
              {
                "type": "web_url",
                "url": url2,
                "title": "Go to the web Page",
              },


            ]
          });
        });


        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: templateElements
              }
            }
          }
        };

        callSendAPI(messageData);

      });

      break;

    case 'QR_GET_PRODUCT_OPTIONS':
      var sh_product = shopify.product.get(requestPayload.id);
      sh_product.then(function (product) {

        // console.log(product);
        var options = '';
        product.options.map(function (option) {
          options = options + option.name + ': ' + option.values.join(',') + "\n";
        });
        var prices = [];
        product.variants.forEach((products) => {
          prices.push(products.price);
        });
        if (prices.length > 0) {
          var price = '';
          var newPrice = prices.every((val, i, arr) => val == arr[0]);
          if (newPrice === true) { price = prices[0] } else {
            price = prices.join(', $') + "\n";

          };
        }

        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            text: options.substring(0, 640) + "Price is : $" + price,
            quick_replies: [
              textButton('Get 3 more products', 'QR_GET_PRODUCT_LIST', { limit: 3 })
            ]
          },
        };
        callSendAPI(messageData);
      });



      break;
      break;


  }


}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id; // the user who sent the message
  var recipientID = event.recipient.id; // the page they sent it from
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function (messageID) {
      // console.log("[receivedDeliveryConfirmation] Message with ID %s was delivered",
      // messageID);
    });
  }

  // console.log("[receivedDeliveryConfirmation] All messages before timestamp %d were delivered.", watermark);
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  // console.log("[receivedPostback] from user (%d) on page (%d) with payload ('%s') " +
  //   "at (%d)", senderID, recipientID, payload, timeOfPostback);

  respondToHelpRequestWithTemplates(senderID, payload);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText, // utf-8, 640-character max
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        // console.log("[callSendAPI] Successfully sent message with id %s to recipient %s",
        //   messageId, recipientId);
      } else {
        // console.log("[callSendAPI] Successfully called Send API for recipient %s",
        //   recipientId);
      }
    } else {
      console.error("[callSendAPI] Send API call failed", response.statusCode, response.statusMessage, body.error);
    }
  });
}

/*
 * Send profile info. This will setup the bot with a greeting and a Get Started button
 */
function callSendProfile() {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messenger_profile',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: {
      "greeting": [
        {
          "locale": "default",
          "text": `Hi there! I'm a bot here to assist you with Candyboxx's Shopify store. To get started, click the "Get Started" button or type "help".`
        }
      ],
      "get_started": {
        "payload": JSON.stringify({ action: 'QR_GET_PRODUCT_LIST', limit: 3 })
      },
      "whitelisted_domains": [
        HOST_URL
      ]
    }

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      // console.log("[callSendProfile]: ", body);
      var result = body.result;
      if (result === 'success') {
        // console.log("[callSendProfile] Successfully sent profile.");
      } else {
        console.error("[callSendProfile] There was an error sending profile.");
      }
    } else {
      console.error("[callSendProfile] Send profile call failed", response.statusCode, response.statusMessage, body.error);
    }
  });
}

/*
 * Start server
 * Webhooks must be available via SSL with a certificate signed by a valid 
 * certificate authority.
 */
app.listen(app.get('port'), function () {
  // console.log('[app.listen] Node app is running on port', app.get('port'));
  callSendProfile();
});

module.exports = app;

function firstEntity(nlp, name) {
  return nlp && nlp.entities && nlp.entities && nlp.entities[name] && nlp.entities[name][0];
}

function search_product_key(messageText) {
  var result = []
  product_tag_keywords.forEach(function (keys) {
    if (messageText.search(keys) != -1) {
      result.push(keys);
    }
  })
  // console.log(result);
  return result;
}

function find_products(keys) {
  Product.find({ 'tags': { $all: keys } }, null, { limit: 5 }, function (err, found_complete_Products) {
    if (!err) {
      const sendProducts = found_complete_Products.forEach(function (product) {
        sendTextMessage(senderID, 'https://dev-circle-toronto-hackathon.myshopify.com/products/' + product.handle);
      });
    }
    else {
      Product.find({ 'tags': { $in: keys } }, null, { limit: 5 }, function (err, found_partial_Products) {
        console.log(found_partial_Products);
        if (err) {
          console.log(err);
        } else {
          const sendProducts = found_partial_Products.forEach(function (product) {
            sendTextMessage(senderID, 'https://dev-circle-toronto-hackathon.myshopify.com/products/' + product.handle);
          });

          sendTextMessage(senderID, sendProducts);
        }
      });
    }
  });
}