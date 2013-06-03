/*global describe:true, it:true, before:true, after:true */

var
	chai           = require('chai'),
	assert         = chai.assert,
	expect         = chai.expect,
	should         = chai.should(),
	when           = require('when'),
	chaiAsPromised = require('chai-as-promised'),
	Crazyradio     = require('../lib/crazyradio')
	;

require('mocha-as-promised')();
chai.use(chaiAsPromised);

describe('Crazyradio', function()
{
	var cr;

	describe('constructor', function()
	{
		it('can be constructed', function()
		{
			var radio = new Crazyradio();
			radio.should.be.an('object');
		});

		it('inherits from EventEmitter', function()
		{
			var radio = new Crazyradio();
			radio.should.have.property('emit');
			radio.emit.should.be.a('function');
		});
	});

	describe('setupRadio()', function()
	{
		it('setupRadio() finds a radio if none is passed in', function()
		{
			cr = new Crazyradio();
			return cr.setupRadio().then(function(result)
			{
				return when.all(
				[
					when(result).should.eventually.equal('OK'),
					when(cr.device).should.eventually.be.ok
				]);
			});
		});

		it('setupRadio() uses the passed-in radio if provided');

		it('throws if no radio is connected');

	});

	describe('sendPacket()', function()
	{
		it('will eventually have tests');
	});

	describe('scanChannels()', function()
	{
		it('returns the result of a scan', function()
		{
			var buff = new Buffer(1);
			buff[0] = 0xff;

			return cr.scanChannels(0, 125, buff).then(function(result)
			{
				return when(Buffer.isBuffer(result));
			});
		});
	});

});
