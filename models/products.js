var mongoose = require('mongoose');
//POST SCHEMA 
var productSchema = new mongoose.Schema({
    id: String,
    title: String,
    image_src: String,
    product_type: String,
    tags: [String],
    handle: String
});


module.exports = mongoose.model('Product', productSchema);
//END OF POST SCHEMA