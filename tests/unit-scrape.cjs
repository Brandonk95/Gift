// Product page extraction (pocketbase/pb_hooks/lib/scrape.js). Run: node tests/unit-scrape.cjs
const s = require("../pocketbase/pb_hooks/lib/scrape.js");
let fails = 0;
const eq = (a, b, n) => {
  const good = JSON.stringify(a) === JSON.stringify(b);
  if (!good) fails++;
  console.log(good ? "ok  " : "FAIL", n, JSON.stringify(a));
};
eq(s.parsePrice("1.299,00 €"), 1299, "eu price");
eq(s.parsePrice("$1,299.99"), 1299.99, "us price");
eq(s.parsePrice("12,5"), 12.5, "comma decimal");
eq(s.parsePrice("1,299"), 1299, "thousands comma");
eq(s.cleanUrl("https://www.amazon.com/x/dp/B0/ref=sr_1_1?keywords=a&th=1&color=red"), "https://www.amazon.com/x/dp/B0?color=red", "clean url");
const html = `<html><head><title>Cool Mug | Shop</title><meta property="og:site_name" content="Shop">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"Product","name":"Cool Mug &amp; Lid","image":["/img/a.jpg","https://cdn.x/b.jpg"],"brand":{"@type":"Brand","name":"MugCo"},"offers":{"@type":"AggregateOffer","lowPrice":"14.50","priceCurrency":"eur"}}]}</script></head></html>`;
const d = s.extract("https://shop.example.com/p/mug?utm_source=x", html);
eq([d.title, d.price, d.currency, d.brand, d.images], ["Cool Mug & Lid", 14.5, "EUR", "MugCo", ["https://shop.example.com/img/a.jpg", "https://cdn.x/b.jpg"]], "json-ld graph");
eq(d.url, "https://shop.example.com/p/mug", "tracking stripped");
eq(s.extract("https://x.com/a", `<title>Thing &#8211; Store</title><meta content='Nice &#39;thing&#39;' name="description">`).description, "Nice 'thing'", "reversed attrs + entities");
eq(s.titleFromUrl("https://www.bestbuy.com/site/apple-airpods-pro-2-white/6447382.p?skuId=6447382"), "Apple Airpods Pro 2 White", "url title");

// price warnings
eq(d.priceNote, "", "single price: no warning");
const range = s.extract("https://x.com/p/tee", `<script type="application/ld+json">{"@type":"Product","name":"Tee","offers":[{"price":"20","priceCurrency":"USD"},{"price":"25","priceCurrency":"USD"}]}</script>`);
eq([range.price, !!range.priceNote], [20, true], "different option prices are flagged");
const guess = s.extract("https://x.com/p/lamp", `<title>Lamp</title><span itemprop="price" content="49.00"></span>`);
eq([guess.price, !!guess.priceNote], [49, true], "price from page code is flagged");

// Shopify
const shopHtml = `<html><head><link rel="preconnect" href="https://cdn.shopify.com"><meta property="og:site_name" content="Tiny Shop"><meta property="og:price:amount" content="9.99">
<script>Shopify.currency = {"active":"CAD","rate":"1.0"};</script></head></html>`;
eq(s.shopifyJsonUrl("https://tiny.shop/collections/mugs/products/blue-mug?variant=2&utm=x", shopHtml), "https://tiny.shop/products/blue-mug.js", "shopify product .js address");
eq(s.shopifyJsonUrl("https://tiny.shop/products/blue-mug", "<html>no platform</html>"), "", "non-shopify page skipped");
eq(s.shopifyJsonUrl("https://tiny.shop/collections/mugs", shopHtml), "", "shopify non-product page skipped");
const product = {
  title: "Blue Mug",
  description: "<p>Hand <b>thrown</b>   stoneware.</p>",
  vendor: "Potter Pat",
  price: 3200,
  price_varies: true,
  images: ["//cdn.shopify.com/s/files/mug-1.jpg", "//cdn.shopify.com/s/files/mug-2.jpg"],
  variants: [
    { id: 1, price: 3200, available: false },
    { id: 2, price: 4500, available: true, featured_image: { src: "https://cdn.shopify.com/s/files/mug-large.jpg" } },
  ],
};
const base = s.extract("https://tiny.shop/products/blue-mug", shopHtml);
const sp = s.applyShopify(JSON.parse(JSON.stringify(base)), product, "https://tiny.shop/products/blue-mug", shopHtml);
eq([sp.title, sp.price, sp.currency, sp.brand, sp.description], ["Blue Mug", 45, "CAD", "Potter Pat", "Hand thrown stoneware."], "shopify data replaces page tags (first available option)");
eq(sp.images.slice(0, 2), ["https://cdn.shopify.com/s/files/mug-large.jpg", "https://cdn.shopify.com/s/files/mug-1.jpg"], "shopify images, option picture first");
eq(!!sp.priceNote, true, "prices vary by option: flagged");
const chosen = s.applyShopify(JSON.parse(JSON.stringify(base)), product, "https://tiny.shop/products/blue-mug?variant=1", shopHtml);
eq([chosen.price, chosen.priceNote], [32, ""], "chosen option's price, no warning");
eq(s.applyShopify({ title: "Keep", images: [] }, { error: "not found" }, "https://tiny.shop/products/x", "").title, "Keep", "bad shopify answer leaves result alone");

process.exitCode = fails ? 1 : 0;
