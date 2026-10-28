const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;
const blocks = require('./blocks.js');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', { title: 'Crank Your Tank', blocks: blocks });
});

const networkInterfaces = os.networkInterfaces();
const localIp = Object.values(networkInterfaces)
  .flat()
  .find((address) => address && address.family === 'IPv4' && !address.internal)?.address;

app.listen(port, localIp, () => {
  console.log(`Server is running at http://localhost:${port}`);
  if (localIp) console.log(`On your network: http://${localIp}:${port}`);
});
