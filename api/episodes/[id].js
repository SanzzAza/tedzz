const { getEpisodes } = require('../../lib/scraper');

module.exports = async (req, res) => {
  try {
    const { id } = req.query;
    const data = await getEpisodes(id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
