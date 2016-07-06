require('dotenv').config();

var express = require('express');
var app = express();
var request = require('request');
app.use(express.bodyParser());

// Set view engine
app.set('view engine', 'ejs');

// Configure auth
var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.REDIRECT_URL);
 
var authUrl = oauth2Client.generateAuthUrl({
  scope: "https://www.google.com/m8/feeds/"
});

app.get('/', function (req, res) {
  res.render("index");
});

app.get('/authorize', function(req, res) {
  res.redirect(authUrl);
});

app.get('/authorized', function(req, res) {
  oauth2Client.getToken(req.query.code, function(err, tokens) {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if(!err) {
      oauth2Client.setCredentials(tokens);
      res.redirect('/manage');
    } else {
      res.send(err);
    }
  });
});

app.get('/manage', function(req, res) {
  // Get user's contacts
  request({
    url: 'https://www.google.com/m8/feeds/contacts/default/full',
    auth: {
      bearer: oauth2Client.credentials.access_token
    },
    qs: {
      'max-results': 50,
      'alt': 'json'
    },
    headers: {
      'GData-Version': '3.0'
    },
    json: true
  }, function(err, response, body) {
    var contacts = body.feed.entry;
    contacts = contacts.map(function(contact) {
      var formatted = {
        id: contact.id['$t'].split('/base/')[1],
        name: '',
        email: ''
      };
      
      if (contact.title['$t']) {
        formatted.name = contact.title['$t'];
      }
      
      if (contact['gd$email']) {
        formatted.email = contact['gd$email'][0].address;
      }
      
      return formatted
    });
    
    res.render('manage', { contacts: contacts });
  });
});

app.post('/delete', function(req, res) {
  console.log('Delete', req.body);
  request({
    url: 'https://www.google.com/m8/feeds/contacts/default/full/' + req.body.contactId,
    method: 'DELETE',
    headers: {
      'GData-Version': '3.0',
      'If-Match': '*'
    },
    auth: {
      bearer: oauth2Client.credentials.access_token
    },
  }, function(err, response, body) {
    if (err) {
      console.error('Server error:', err);
      res.status(400).send('Error', err.message);
    }
    console.log(response.statusMessage, response.body);
    res.status(response.statusCode).send(response.statusMessage);  
  });
});

app.listen(process.env.PORT, function () {
  console.log('Example app listening on port 3000!');
});