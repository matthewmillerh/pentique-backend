// What one unit of a product sells for right now: the special price while the product is on special
export const sellingPrice = product =>
    product.productSpecial && Number(product.productSpecialPrice) > 0
        ? Number(product.productSpecialPrice)
        : Number(product.productPrice)
