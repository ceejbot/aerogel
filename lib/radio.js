// Radio driver.

var
	events = require('events'),
	url = require('url'),
	util = require('util')
	;

function RadioDriver(name)
{
	events.EventEmitter.call(this);

	this.uri = '';
	this.channel = 2;
	this.datarate = undefined;
}
util.inherits(RadioDriver, events.EventEmitter);


RadioDriver.prototype.connect = function(uri)
{
	this.uri = uri;
	var parsed = url.parse(uri);
	var pieces = parsed.pathname.split('/');

	if (pieces.length = 3)
	{

	}

	"^radio://([0-9]+)((/([0-9]+))(/(250K|1M|2M))?)?$"

};




module.exports = RadioDriver;
