exports.handler = async function(event) {
  if(event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' };
  
  const { query, store } = event.queryStringParameters || {};
  if(!query) return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) };

  const SCRAPE_KEY = process.env.SCRAPE_DO_KEY;
  const TAGS = {
    ie: process.env.AMAZON_TAG_IE || '',
    gb: process.env.AMAZON_TAG_GB || '',
    de: process.env.AMAZON_TAG_DE || '',
    fr: process.env.AMAZON_TAG_FR || '',
    it: process.env.AMAZON_TAG_IT || '',
    es: process.env.AMAZON_TAG_ES || '',
  };

  if(!SCRAPE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'API key not set' }) };

  const targetStore = store || 'amazon.ie';
  const targetUrl = `https://www.${targetStore}/s?k=${encodeURIComponent(query)}`;
  const scrapeUrl = `https://api.scrape.do?token=${SCRAPE_KEY}&url=${encodeURIComponent(targetUrl)}&render=true`;

  try {
    const response = await fetch(scrapeUrl);
    if(!response.ok) return { statusCode: response.status, body: JSON.stringify({ error: `Scrape failed: ${response.status}` }) };

    const html = await response.text();
    const products = [];
    const chunks = html.split('data-component-type="s-search-result"');

    for(let i = 1; i < Math.min(chunks.length, 9); i++) {
      const chunk = chunks[i];
      const asinMatch  = chunk.match(/data-asin="([A-Z0-9]{10})"/);
      const titleMatch = chunk.match(/class="[^"]*a-size-medium[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/) ||
                         chunk.match(/class="[^"]*a-size-base-plus[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/);
      const priceMatch = chunk.match(/class="a-offscreen">([€£$][0-9,\.]+)<\/span>/);
      const imgMatch   = chunk.match(/class="s-image"[^>]*src="([^"]+)"/);
      if(!asinMatch || !titleMatch || !priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(/[€£$,]/g,''));
      if(!price) continue;
      const asin = asinMatch[1];
      const storeCode = Object.entries({ie:'amazon.ie',gb:'amazon.co.uk',de:'amazon.de',fr:'amazon.fr',it:'amazon.it',es:'amazon.es'}).find(e=>e[1]===targetStore)?.[0]||'ie';
      const tag = TAGS[storeCode];
      products.push({
        asin, price,
        title: titleMatch[1].trim(),
        thumb: imgMatch ? imgMatch[1] : '',
        buyLink: `https://www.${targetStore}/dp/${asin}${tag?'?tag='+tag:''}`,
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ products, store: targetStore, query })
    };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
