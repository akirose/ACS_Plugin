const debug = require('debug')('acs-http:debug')
	, info = require('debug')('acs-http:info')
	, express = require('express')
	, app = express()
	, bodyParser = require('body-parser') 
	, engine = require('express-ejs-layouts')
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server)
	, monitor = require('./monitor.js')(io)
	, fs = require('fs');

/* Setting to use socket.io */
app.server = server;
app.io = io;

/* Setup ejs template engine */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/webui');
app.set('layout', 'layout');

/* always using ejs-layout module */
app.use(engine);

/* Use request body parser */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

/* Define Static Files Path */
app.use('/images', express.static(__dirname + '/webui/images'));
app.use('/script', express.static(__dirname + '/webui/script'));
app.use('/style', express.static(__dirname + '/webui/style'));
app.use('/script/bootbox.min.js', express.static(__dirname + '/node_modules/bootbox/bootbox.min.js'));

app.get('/', function(req, res) {
	res.render('index');
});

/* ACS Plug-in Setup Read / Write */
app.get('/read-setup', function(req, res) {
	res.json(fs.readFileSync('config.json', 'utf8'));
}).post('/write-setup', function(req, res) {
	process.send({ command: 'config', config: req.body });
	res.status(200).end();
});

/* ACS Plug-in Start / Stop */
app.get('/start_plugin', function(req, res) {
	process.send({ command: 'start_plugin' });
	res.status(200).end();
}).get('/stop_plugin', function(req, res) {
	process.send({ command: 'stop_plugin' });
	res.status(200).end();
});

app.get('/monitor', function(req, res) {
	res.render('monitor');
});

var port = Number(process.argv[2]);
server.listen(port, function() {
	info("Http server listening on port %d (PID : %d)", port, process.pid);
});

// Process SIGNAL Event Listening
process.on('SIGINT', function() {
	process.exit();
});