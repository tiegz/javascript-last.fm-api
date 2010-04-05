/*
 *
 * Copyright (c) 2008-2009, Felix Bruns <felixbruns@web.de>
 *
 */

function LastFM(options){
	/* Set default values for required options. */
	var apiKey                = options.apiKey    || '';
	var apiSecret             = options.apiSecret || '';
	var apiUrl                = options.apiUrl    || 'http://ws.audioscrobbler.com/2.0/';
	var webAuthToken          = options.authToken || undefined;
	var webAuthTokenRegExp    = /token=([a-zA-Z0-9]{32})/;
	var webSessionKey         = options.webSessionKey || undefined;
	var scrobbleHandshakeUrl  = options.scrobbleHandshakeUrl || 'lastfm_handshake.php'; //'http://post.audioscrobbler.com/';
	var scrobbleSessionId     = options.scrobbleSessionId || undefined;
	var scrobbleNowPlayingUrl = options.scrobbleNowPlayingUrl || undefined;
	var scrobbleSubmissionUrl = options.scrobbleSubmissionUrl || undefined;
	var cache                 = options.cache     || undefined;

	/* Set API key. */
	this.setApiKey = function(_apiKey){
		apiKey = _apiKey;
	};

	/* Set API key. */
	this.setApiSecret = function(_apiSecret){
		apiSecret = _apiSecret;
	};

	/* Set API URL. */
	this.setApiUrl = function(_apiUrl){
		apiUrl = _apiUrl;
	};

	/* Set cache. */
	this.setCache = function(_cache){
		cache = _cache;
	};
	
	this.setScrobbleSessionId = function(_id){
		scrobbleSessionId = _id;
	};
	
	this.setScrobbleNowPlayingUrl = function(_id){
		scrobbleNowPlayingUrl = _id;
	};
	
	this.setScrobbleSubmissionUrl = function(_id){
		scrobbleSubmissionUrl = _id;
	}

	/* Internal call (POST, GET). */
	var internalCall = function(params, callbacks, requestMethod, url){
		/* An optional url may be passed (for the Submissions, for example) */
		url = url || apiUrl;

		/* Cross-domain POST request (doesn't return any data, always successful). */
		if(requestMethod == 'POST'){
			/* Create iframe element to post data. */
			var html   = document.getElementsByTagName('html')[0];
			var iframe = document.createElement('iframe');
			var doc;

			/* Set iframe attributes. */
			iframe.width        = 1;
			iframe.height       = 1;
			iframe.style.border = 'none';
			iframe.onload       = function(){
				/* Remove iframe element. */
				//html.removeChild(iframe);

				/* Call user callback. */
				if(typeof(callbacks.success) != 'undefined'){
					callbacks.success();
				}
			};

			/* Append iframe. */
			html.appendChild(iframe);

			/* Get iframe document. */
			if(typeof(iframe.contentWindow) != 'undefined'){
				doc = iframe.contentWindow.document;
			}
			else if(typeof(iframe.contentDocument.document) != 'undefined'){
				doc = iframe.contentDocument.document.document;
			}
			else{
				doc = iframe.contentDocument.document;
			}

			/* Open iframe document and write a form. */
			doc.open();
			doc.clear();

			doc.write('<form method="post" action="' + url + '" id="form">');

			/* Write POST parameters as input fields. */
			for(var param in params){
				doc.write('<input type="text" name="' + param + '" value="' + params[param] + '">');
			}

			/* Write automatic form submission code. */
			doc.write('</form>');
			doc.write('<script type="application/x-javascript">');
			doc.write('document.getElementById("form").submit();');
			doc.write('</script>');

			/* Close iframe document. */
			doc.close();
		}
		/* Cross-domain GET request (JSONP). */
		else{
			/* Get JSONP callback name. */
			var jsonp = 'jsonp' + new Date().getTime();

			/* Calculate cache hash. */
			var hash = auth.getApiSignature(params);

			/* Check cache. */
			if(typeof(cache) != 'undefined' && cache.contains(hash) && !cache.isExpired(hash)){
				if(typeof(callbacks.success) != 'undefined'){
					callbacks.success(cache.load(hash));
				}

				return;
			}

			/* Set url, callback name, response format. */
			params.callback = jsonp;
			params.format   = 'json';

			/* Create JSONP callback function. */
			window[jsonp] = function(data){
				/* Is a cache available?. */
				if(typeof(cache) != 'undefined'){
					var expiration = cache.getExpirationTime(params);

					if(expiration > 0){
						cache.store(hash, data, expiration);
					}
				}

				/* Call user callback. */
				if(typeof(data.error) != 'undefined'){
					if(typeof(callbacks.error) != 'undefined'){
						callbacks.error(data.error, data.message);
					}
				}
				else if(typeof(callbacks.success) != 'undefined'){
					callbacks.success(data);
				}

				/* Garbage collect. */
				window[jsonp] = undefined;

				try{
					delete window[jsonp];
				}
				catch(e){
					/* Nothing. */
				}

				/* Remove script element. */
				if(head){
					head.removeChild(script);
				}
			};

			/* Create script element to load JSON data. */
			var head   = document.getElementsByTagName("head")[0];
			var script = document.createElement("script");

			/* Build parameter string. */
			var array = [];

			for(var param in params){
				array.push(encodeURIComponent(param) + "=" + encodeURIComponent(params[param]));
			}

			params = array.join('&').replace(/%20/g, '+');

			/* Set script source. */
			script.src = url + '?' + params;

			/* Append script element. */
			head.appendChild(script);
		}
	};

	/* Handshake call. (http://www.last.fm/api/submissions) */
	this.handshakeCall = function(params, callbacks){
		var _this = this;

		if (!webAuthToken) {
			auth.getWebAuthToken(function(){
				_this.handshakeCall(params);
			});
			return false;
		}

		if (!webSessionKey) {
			this.auth.getSession({'api_key' : apiKey, 'token' : webAuthToken}, {success: function(data){
				/* Sessions are infinite by default. Store this securely. */
				/* TODO store this in a cookie? */
				webSessionKey = data.session.key;
				_this.handshakeCall(params);
			}});
			return false;
		}

		var ts = Math.round(new Date().getTime() / 1000);
		var params = {
			'hs'      : 'true',          // indicates this is a handshake
			'p'       : '1.2.1',         // version of submissions protocol
			'c'       : 'tst',           // OBTAIN A CLIENT IDENTIFIER FROM LAST.FM! This one's only for development.
			'v'       : '1.0',           // version of client,
			'u'       : params.username, // last.fm user
			't'       : ts,
			'a'       : auth.getHandshakeToken(ts),
			'api_key' : apiKey,
			'sk'      : webSessionKey
		};

		internalCall(params, {success:function(data){
			/* From API specs: "These values may change per handshake and should be used for one listening */
			/*                 "session" only and not stored across application restarts."                 */
			scrobbleSessionId     = data.scrobbleSessionId;
			scrobbleNowPlayingUrl = data.scrobbleNowPlayingUrl;
			scrobbleSubmissionUrl = data.scrobbleSubmissionUrl;

			/* Call user callback. */
			if(typeof(callbacks.success) != 'undefined'){
				callbacks.success();
			}
		}}, 'GET', scrobbleHandshakeUrl);
	};
	
	/* Normal method call. */
	var call = function(method, params, callbacks, requestMethod){
		/* Set default values. */
		params        = params        || {};
		callbacks     = callbacks     || {};
		requestMethod = requestMethod || 'GET';

		/* Add parameters. */
		params.method  = method;
		params.api_key = apiKey;

		/* Call method. */
		internalCall(params, callbacks, requestMethod);
	};

	/* Signed method call. */
	var signedCall = function(method, params, session, callbacks, requestMethod){
		/* Set default values. */
		params        = params        || {};
		callbacks     = callbacks     || {};
		requestMethod = requestMethod || 'GET';

		/* Add parameters. */
		params.method  = method;
		params.api_key = apiKey;

		/* Add session key. */
		if(session && typeof(session.key) != 'undefined'){
			params.sk = session.key;
		}

		/* Get API signature. */
		params.api_sig = auth.getApiSignature(params);

		/* Call method. */
		internalCall(params, callbacks, requestMethod);
	};

	/* Album methods. */
	this.album = {
		addTags : function(params, session, callbacks){
			/* Build comma separated tags string. */
			if(typeof(params.tags) == 'object'){
				params.tags = params.tags.join(',');
			}

			signedCall('album.addTags', params, session, callbacks, 'POST');
		},

		getInfo : function(params, callbacks){
			call('album.getInfo', params, callbacks);
		},

		getTags : function(params, session, callbacks){
			signedCall('album.getTags', params, session, callbacks);
		},

		removeTag : function(params, session, callbacks){
			signedCall('album.removeTag', params, session, callbacks, 'POST');
		},

		search : function(params, callbacks){
			call('album.search', params, callbacks);
		}
	};

	/* Artist methods. */
	this.artist = {
		addTags : function(params, session, callbacks){
			/* Build comma separated tags string. */
			if(typeof(params.tags) == 'object'){
				params.tags = params.tags.join(',');
			}

			signedCall('artist.addTags', params, session, callbacks, 'POST');
		},

		getEvents : function(params, callbacks){
			call('artist.getEvents', params, callbacks);
		},

		getImages : function(params, callbacks){
			call('artist.getImages', params, callbacks);
		},

		getInfo : function(params, callbacks){
			call('artist.getInfo', params, callbacks);
		},

		getPastEvents : function(params, callbacks){
			call('artist.getPastEvents', params, callbacks);
		},

		getPodcast : function(params, callbacks){
			call('artist.getPodcast', params, callbacks);
		},

		getShouts : function(params, callbacks){
			call('artist.getShouts', params, callbacks);
		},

		getSimilar : function(params, callbacks){
			call('artist.getSimilar', params, callbacks);
		},

		getTags : function(params, session, callbacks){
			signedCall('artist.getTags', params, session, callbacks);
		},

		getTopAlbums : function(params, callbacks){
			call('artist.getTopAlbums', params, callbacks);
		},

		getTopFans : function(params, callbacks){
			call('artist.getTopFans', params, callbacks);
		},

		getTopTags : function(params, callbacks){
			call('artist.getTopTags', params, callbacks);
		},

		getTopTracks : function(params, callbacks){
			call('artist.getTopTracks', params, callbacks);
		},

		removeTag : function(params, session, callbacks){
			signedCall('artist.removeTag', params, session, callbacks, 'POST');
		},

		search : function(params, callbacks){
			call('artist.search', params, callbacks);
		},

		share : function(params, session, callbacks){
			/* Build comma separated recipients string. */
			if(typeof(params.recipient) == 'object'){
				params.recipient = params.recipient.join(',');
			}

			signedCall('artist.share', params, session, callbacks, 'POST');
		},

		shout : function(params, session, callbacks){
			signedCall('artist.shout', params, session, callbacks, 'POST');
		}
	};

	/* Auth methods. */
	this.auth = {
		getMobileSession : function(params, callbacks){
			/* Set new params object with authToken. */
			params = {
				username  : params.username,
				authToken : md5(params.username + md5(params.password))
			};

			signedCall('auth.getMobileSession', params, null, callbacks);
		},

		getSession : function(params, callbacks){
			signedCall('auth.getSession', params, null, callbacks);
		},

		getToken : function(callbacks){
			signedCall('auth.getToken', null, null, callbacks);
		},

		/* Deprecated. Security hole was fixed. */
		getWebSession : function(callbacks){
			/* Save API URL and set new one (needs to be done due to a cookie!). */
			var previuousApiUrl = apiUrl;

			apiUrl = 'http://ext.last.fm/2.0/';

			signedCall('auth.getWebSession', null, null, callbacks);

			/* Restore API URL. */
			apiUrl = previuousApiUrl;
		}
	};

	/* Event methods. */
	this.event = {
		attend : function(params, session, callbacks){
			signedCall('event.attend', params, session, callbacks, 'POST');
		},

		getAttendees : function(params, session, callbacks){
			call('event.getAttendees', params, callbacks);
		},

		getInfo : function(params, callbacks){
			call('event.getInfo', params, callbacks);
		},

		getShouts : function(params, callbacks){
			call('event.getShouts', params, callbacks);
		},

		share : function(params, session, callbacks){
			/* Build comma separated recipients string. */
			if(typeof(params.recipient) == 'object'){
				params.recipient = params.recipient.join(',');
			}

			signedCall('event.share', params, session, callbacks, 'POST');
		},

		shout : function(params, session, callbacks){
			signedCall('event.shout', params, session, callbacks, 'POST');
		}
	};

	/* Geo methods. */
	this.geo = {
		getEvents : function(params, callbacks){
			call('geo.getEvents', params, callbacks);
		},

		getMetroArtistChart : function(params, callbacks){
			call('geo.getMetroArtistChart', params, callbacks);
		},

		getMetroTrackChart : function(params, callbacks){
			call('geo.getMetroTrackChart', params, callbacks);
		},

		getMetroUniqueArtistChart : function(params, callbacks){
			call('geo.getMetroUniqueArtistChart', params, callbacks);
		},

		getMetroUniqueTrackChart : function(params, callbacks){
			call('geo.getMetroUniqueTrackChart', params, callbacks);
		},

		getMetroWeeklyChartlist : function(params, callbacks){
			call('geo.getMetroWeeklyChartlist', params, callbacks);
		},

		getTopArtists : function(params, callbacks){
			call('geo.getTopArtists', params, callbacks);
		},

		getTopTracks : function(params, callbacks){
			call('geo.getTopTracks', params, callbacks);
		}
	};

	/* Group methods. */
	this.group = {
		getMembers : function(params, callbacks){
			call('group.getMembers', params, callbacks);
		},

		getWeeklyAlbumChart : function(params, callbacks){
			call('group.getWeeklyAlbumChart', params, callbacks);
		},

		getWeeklyArtistChart : function(params, callbacks){
			call('group.group.getWeeklyArtistChart', params, callbacks);
		},

		getWeeklyChartList : function(params, callbacks){
			call('group.getWeeklyChartList', params, callbacks);
		},

		getWeeklyTrackChart : function(params, callbacks){
			call('group.getWeeklyTrackChart', params, callbacks);
		}
	};

	/* Library methods. */
	this.library = {
		addAlbum : function(params, session, callbacks){
			signedCall('library.addAlbum', params, session, callbacks, 'POST');
		},

		addArtist : function(params, session, callbacks){
			signedCall('library.addArtist', params, session, callbacks, 'POST');
		},

		addTrack : function(params, session, callbacks){
			signedCall('library.addTrack', params, session, callbacks, 'POST');
		},

		getAlbums : function(params, callbacks){
			call('library.getAlbums', params, callbacks);
		},

		getArtists : function(params, callbacks){
			call('library.getArtists', params, callbacks);
		},

		getTracks : function(params, callbacks){
			call('library.getTracks', params, callbacks);
		}
	};

	/* Playlist methods. */
	this.playlist = {
		addTrack : function(params, session, callbacks){
			signedCall('playlist.addTrack', params, session, callbacks, 'POST');
		},

		create : function(params, session, callbacks){
			signedCall('playlist.create', params, session, callbacks, 'POST');
		},

		fetch : function(params, callbacks){
			call('playlist.fetch', params, callbacks);
		}
	};

	/* Radio methods. */
	this.radio = {
		getPlaylist : function(params, session, callbacks){
			signedCall('radio.getPlaylist', params, session, callbacks);
		},

		tune : function(params, session, callbacks){
			signedCall('radio.tune', params, session, callbacks);
		}
	};
	
	/* Submissions [scrobbling] methods. */
	/* (at 'http://www.last.fm/api/submissions#handshake') */
	this.submissions = {
		/* From API docs: */
		/*   "The Now-Playing notification is optional, but recommended and should be sent */
		/*    once when a user starts listening to a song." */
		nowPlaying : function(params, callbacks){
			if (!scrobbleSessionId || !scrobbleNowPlayingUrl) throw("Please make the Submissions handshake first.");

			params   = params || {};
			params.s = scrobbleSessionId;
			params.a = params.a || ""; /* Artist Name */
			params.t = params.t || ""; /* Track Name */
			params.b = params.b || ""; /* Album Name */
			params.l = params.l || ""; /* Track Length */
			params.n = params.n || ""; /* Track Number */
			params.m = params.m || ""; /* MusicBrainz Track ID */

			internalCall(params, callbacks, 'POST', scrobbleNowPlayingUrl);
		}, 
		
		/* From API docs:                                                                                             */
		/*   "The client should monitor the user's interaction with the music playing service to whatever extent the  */
		/*    service allows. In order to qualify for submission all of the following criteria must be met:           */
		/*                                                                                                            */
		/*    - The track must be submitted once it has finished playing. Whether it has finished playing naturally   */
		/*      or has been manually stopped by the user is irrelevant.                                               */
		/*    - The track must have been played for a duration of at least 240 seconds or half the track's total      */
		/*      length, whichever comes first. Skipping or pausing the track is irrelevant as long as the appropriate */
		/*       amount has been played.                                                                              */
		/*    - The total playback time for the track must be more than 30 seconds. Do not submit tracks shorter      */
		/*      than this.                                                                                            */
		/*    - Unless the client has been specially configured, it should not attempt to interpret filename          */
		/*      information to obtain metadata instead of using tags (ID3, etc)."                                     */
		submission : function(params, callbacks){
			if (!scrobbleSessionId || !scrobbleSubmissionUrl) throw("Please make the Submissions handshake first.");

			params      = params || {};
			params.s    = scrobbleSessionId;

			/* Required params for first submission (can be up to 50). */
			params['a[0]'] = params['a[0]'] || ""; /* Artist Name */
			params['t[0]'] = params['t[0]'] || ""; /* Track Name */
			params['i[0]'] = params['i[0]'] || Math.round(new Date().getTime() / 1000); /* Time Started Playing */
			params['o[0]'] = params['o[0]'] || "P"; /* Src: (P)erson, Non-personalized B(R)oadcast, P(E)rsonalized Rec., (L)ast.fm */
			params['r[0]'] = params['r[0]'] || ""; /* Rating: (L)ove, (B)an, (S)kip ... ['B' and 'S' require 'o' = 'L'] */
			params['b[0]'] = params['b[0]'] || ""; /* Album Name */
			params['l[0]'] = params['l[0]'] || ""; /* Track Length (required for 'o' = 'P') */
			params['n[0]'] = params['n[0]'] || ""; /* Track Number */
			params['m[0]'] = params['m[0]'] || ""; /* MusicBrainz Track ID */

			internalCall(params, callbacks, 'POST', scrobbleSubmissionUrl);
		}
	};



	/* Tag methods. */
	this.tag = {
		getSimilar : function(params, callbacks){
			call('tag.getSimilar', params, callbacks);
		},

		getTopAlbums : function(params, callbacks){
			call('tag.getTopAlbums', params, callbacks);
		},

		getTopArtists : function(params, callbacks){
			call('tag.getTopArtists', params, callbacks);
		},

		getTopTags : function(callbacks){
			call('tag.getTopTags', null, callbacks);
		},

		getTopTracks : function(params, callbacks){
			call('tag.getTopTracks', params, callbacks);
		},

		getWeeklyArtistChart : function(params, callbacks){
			call('tag.getWeeklyArtistChart', params, callbacks);
		},

		getWeeklyChartList : function(params, callbacks){
			call('tag.getWeeklyChartList', params, callbacks);
		},

		search : function(params, callbacks){
			call('tag.search', params, callbacks);
		}
	};

	/* Tasteometer method. */
	this.tasteometer = {
		compare : function(params, callbacks){
			call('tasteometer.compare', params, callbacks);
		}
	};

	/* Track methods. */
	this.track = {
		addTags : function(params, session, callbacks){
			signedCall('track.addTags', params, session, callbacks, 'POST');
		},

		ban : function(params, session, callbacks){
			signedCall('track.ban', params, session, callbacks, 'POST');
		},

		getInfo : function(params, callbacks){
			call('track.getInfo', params, callbacks);
		},

		getSimilar : function(params, callbacks){
			call('track.getSimilar', params, callbacks);
		},

		getTags : function(params, session, callbacks){
			signedCall('track.getTags', params, session, callbacks);
		},

		getTopFans : function(params, callbacks){
			call('track.getTopFans', params, callbacks);
		},

		getTopTags : function(params, callbacks){
			call('track.getTopTags', params, callbacks);
		},

		love : function(params, session, callbacks){
			signedCall('track.love', params, session, callbacks, 'POST');
		},

		removeTag : function(params, session, callbacks){
			signedCall('track.removeTag', params, session, callbacks, 'POST');
		},

		search : function(params, callbacks){
			call('track.search', params, callbacks);
		},

		share : function(params, session, callbacks){
			/* Build comma separated recipients string. */
			if(typeof(params.recipient) == 'object'){
				params.recipient = params.recipient.join(',');
			}

			signedCall('track.share', params, session, callbacks, 'POST');
		}
	};

	/* User methods. */
	this.user = {
		getEvents : function(params, callbacks){
			call('user.getEvents', params, callbacks);
		},

		getFriends : function(params, callbacks){
			call('user.getFriends', params, callbacks);
		},

		getInfo : function(params, callbacks){
			call('user.getInfo', params, callbacks);
		},

		getLovedTracks : function(params, callbacks){
			call('user.getLovedTracks', params, callbacks);
		},

		getNeighbours : function(params, callbacks){
			call('user.getNeighbours', params, callbacks);
		},

		getPastEvents : function(params, callbacks){
			call('user.getPastEvents', params, callbacks);
		},

		getPlaylists : function(params, callbacks){
			call('user.getPlaylists', params, callbacks);
		},

		getRecentStations : function(params, session, callbacks){
			signedCall('user.getRecentStations', params, session, callbacks);
		},

		getRecentTracks : function(params, callbacks){
			call('user.getRecentTracks', params, callbacks);
		},

		getRecommendedArtists : function(params, session, callbacks){
			signedCall('user.getRecommendedArtists', params, session, callbacks);
		},

		getRecommendedEvents : function(params, session, callbacks){
			signedCall('user.getRecommendedEvents', params, session, callbacks);
		},

		getShouts : function(params, callbacks){
			call('user.getShouts', params, callbacks);
		},

		getTopAlbums : function(params, callbacks){
			call('user.getTopAlbums', params, callbacks);
		},

		getTopArtists : function(params, callbacks){
			call('user.getTopArtists', params, callbacks);
		},

		getTopTags : function(params, callbacks){
			call('user.getTopTags', params, callbacks);
		},

		getTopTracks : function(params, callbacks){
			call('user.getTopTracks', params, callbacks);
		},

		getWeeklyAlbumChart : function(params, callbacks){
			call('user.getWeeklyAlbumChart', params, callbacks);
		},

		getWeeklyArtistChart : function(params, callbacks){
			call('user.getWeeklyArtistChart', params, callbacks);
		},

		getWeeklyChartList : function(params, callbacks){
			call('user.getWeeklyChartList', params, callbacks);
		},

		getWeeklyTrackChart : function(params, callbacks){
			call('user.getWeeklyTrackChart', params, callbacks);
		},

		shout : function(params, session, callbacks){
			signedCall('user.shout', params, session, callbacks, 'POST');
		}
	};

	/* Venue methods. */
	this.venue = {
		getEvents : function(params, callbacks){
			call('venue.getEvents', params, callbacks);
		},

		getPastEvents : function(params, callbacks){
			call('venue.getPastEvents', params, callbacks);
		},

		search : function(params, callbacks){
			call('venue.search', params, callbacks);
		}
	};

	/* Private auth methods. */
	var auth = {
		getApiSignature : function(params){
			var keys   = [];
			var string = '';

			for(var key in params){
				keys.push(key);
			}

			keys.sort();

			for(var index in keys){
				var key = keys[index];

				string += key + params[key];
			}

			string += apiSecret;

			/* Needs lastfm.api.md5.js. */
			return md5(string);
		},

		getHandshakeToken : function(timestamp){
			return md5(apiSecret + timestamp);
		},
		
		getWebAuthToken : function(callback){
      var url = 'http://www.last.fm/api/auth/?api_key=' + apiKey;
      var authPopup = window.open(url, 'lastfmAuth');

			if (authPopup) {
				authPopup.focus();
				/* Wait for Web Auth. */
				var interval = setInterval(function() {
					if (authPopup.window && 
							authPopup.window.location && 
							authPopup.window.location.search && 
							authPopup.window.location.search.match(webAuthTokenRegExp)) {
						webAuthToken = webAuthTokenRegExp(authPopup.window.location.search)[1];
						window.focus();
						authPopup.close();
						callback();
						clearInterval(interval);
					}
				}, 500);
			} else {
				/* Handle popup-blocking...should we use iframe instead of redirect? */
				window.location = url;
				/* TODO finish this part */
			}
		}
	};
	
	/* In case this is coming from last.fm web authentication (popup, or the origin receiving the token) */
	if (window.opener && window.opener.LastFM) {
		window.opener.focus(); 
	} else if (window.location.search.match(webAuthTokenRegExp)) {
		webAuthToken = webAuthTokenRegExp(window.location.search)[1];
	}
}
