const { getStreamUrl } = require('../../lib/scraper');

module.exports = async (req, res) => {
  try {
    const { id } = req.query;
    const data = await getStreamUrl(id);
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    
    res.json({ 
      success: true, 
      data,
      note: "URL expires quickly. Use immediately."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
