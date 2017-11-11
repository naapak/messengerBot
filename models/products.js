var mongoose = require('mongoose');
//POST SCHEMA 
 var productSchema = new mongoose.Schema({
    id: String,
    title: String,
    product_type: String,
    tags: String
});


module.exports = mongoose.model('Product', postSchema);
//END OF POST SCHEMA