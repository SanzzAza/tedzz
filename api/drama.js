const { getDramaList } = require('../lib/scraper');

module.exports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await getDramaList(page);
    res.json({ success: true, page, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
