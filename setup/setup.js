const express = require('express')
	, engine = require('express-ejs-layouts')
	, bodyParser = require('body-parser')
	, fs = require('fs');

/* Using expressjs framework */
const app = express();

/* Setup ejs template engine */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layout');
app.use(engine);

/* Use request body parser */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

/* Define Static Files Path */
app.use('/images', express.static(__dirname + '/views/images'));
app.use('/script', express.static(__dirname + '/views/script'));
app.use('/style', express.static(__dirname + '/views/style'));

app.get('/', function(req, res) {
	res.render('index');
});

app.get('/read-setup', function(req, res) {
	res.json(fs.readFileSync('config.json', 'utf8'));
});

app.post('/write-setup', function(req, res) {
	fs.writeFileSync('config.json', JSON.stringify(req.body, null, '\t'), 'utf8');

	res.json({response:200});
});

module.exports = app;