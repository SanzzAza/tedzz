const { getDramaDetail } = require('../../lib/scraper');

module.exports = async (req, res) => {
  try {
    const { id } = req.query;
    const data = await getDramaDetail(id);
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Drama not found' });
    }
    
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
