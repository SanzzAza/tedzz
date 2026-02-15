const { searchDrama } = require('../lib/scraper');

module.exports = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter "q" is required. Example: /api/search?q=cinta' 
      });
    }
    
    const data = await searchDrama(q);
    
    res.json({ 
      success: true, 
      query: q, 
      count: data.length,
      data 
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
