module.exports = (req, res) => {
  res.json({
    message: "GoodShort Unofficial API",
    endpoints: {
      "GET /api/dramas?page=1": "List semua drama",
      "GET /api/drama/:id": "Detail drama",
      "GET /api/episodes/:dramaId": "List episode",
      "GET /api/watch/:episodeId": "URL streaming",
      "GET /api/search?q=keyword": "Cari drama"
    },
    example: "https://your-domain.vercel.app/api/dramas"
  });
};
