/*global describe:true, it:true, before:true, after:true */

var
	chai           = require('chai'),
	assert         = chai.assert,
	expect         = chai.expect,
	should         = chai.should(),
	chaiAsPromised = require('chai-as-promised'),
	Crazyradio     = require('../lib/crazyradio'),
	CrazyDriver    = require('../lib/crazydriver')
	;

require('mocha-as-promised')();
chai.use(chaiAsPromised);

describe('CrazyDriver', function()
{
	it('will have tests some day');
});

