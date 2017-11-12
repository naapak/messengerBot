shopify.product.list().then(
    (product_list) => {
        product_list.forEach(function (element) {
            var newProduct = {
                id: element.id,
                title: element.title,
                product_type: element.product_type,
                tags: element.tags,
                handle: element.handle
            };

            Product.create(newProduct, function (err, newProduct) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(newProduct);
                }
            })
        }
        )
    }
)