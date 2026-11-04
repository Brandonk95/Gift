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
process.exitCode = fails ? 1 : 0;
