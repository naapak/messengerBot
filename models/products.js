var mongoose = require('mongoose');
//POST SCHEMA 
var productSchema = new mongoose.Schema({
    id: String,
    title: String,
    product_type: String,
<<<<<<< HEAD
    tags: String,
=======
    tags: Array,
>>>>>>> master_1
    handle: String
});


module.exports = mongoose.model('Product', productSchema);
//END OF POST SCHEMA