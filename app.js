const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const blocks = require('./blocks.js');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', { title: 'Crank Your Tank', blocks: blocks });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
