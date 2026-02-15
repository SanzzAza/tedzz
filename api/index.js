module.exports = (req, res) => {
  res.json({
    name: "GoodShort Unofficial API",
    version: "1.0.0",
    endpoints: {
      "GET /api/dramas?page=1": "List all dramas",
      "GET /api/drama/:id": "Get drama details",
      "GET /api/episodes/:dramaId": "Get episodes list",
      "GET /api/watch/:episodeId": "Get streaming URL",
      "GET /api/search?q=keyword": "Search dramas"
    },
    example: {
      list: "https://your-domain.vercel.app/api/dramas",
      search: "https://your-domain.vercel.app/api/search?q=romance",
      detail: "https://your-domain.vercel.app/api/drama/12345"
    }
  });
};
