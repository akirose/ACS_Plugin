const express = require('express')
	, engine = require('express-ejs-layouts');

/* Using expressjs framework */
const app = express();

/* Setup ejs template engine */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layout');
app.use(engine);

/* Define Static Files Path */
app.use('/images', express.static(__dirname + '/views/images'));
app.use('/script', express.static(__dirname + '/views/script'));
app.use('/style', express.static(__dirname + '/views/style'));

app.get('/', function(req, res) {
	res.render('index');
});

app.post('/write-setup', function(req, res) {
	console.log(req.body);

	
	res.json({response:200});
});

module.exports = app;