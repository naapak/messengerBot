if (intent && intent.confidence > 0.8 && intent.value == 'shipping_where') {
    shopify.shippingZone.list().then(
        (shipzones) => {
            shipzones.shipping_zones.forEach(function (country) {
                sendTextMessage(senderID, country.countries[0].name);
            })
        }
    )
}