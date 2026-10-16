const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory (cross-platform path.join)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
    console.log(`Sonic Retro Physics Engine running at http://localhost:${port}`);
});
