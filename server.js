require('dotenv').config();

var express = require('express');
var app = express();
var request = require('request');
app.use(express.bodyParser());
var querystring = require('querystring');

// Connect to db
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/local');

var db = mongoose.connection;

var contactSchema = mongoose.Schema({
    gContactId: String,
    name: {
      type: String,
      default: 'no_name'
    },
    email: {
      type: String,
      default: 'no_email'
    },
    numOfMessages: {
      type: Number,
      default: 0
    }
});

var Contact = mongoose.model('Contact', contactSchema);

// Set view engine
app.set('view engine', 'ejs');

// Configure auth
var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.REDIRECT_URL);
 
var authUrl = oauth2Client.generateAuthUrl({
  scope: [ 
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.google.com/m8/feeds/"
     ]
});

// Load homepage
app.get('/', function (req, res) {
  res.render("index");
});

// Authorize with Google using OAuth2
app.get('/authorize', function(req, res) {
  res.redirect(authUrl);
});

// Google redirects here after succesfull authorization
app.get('/authorized', function(req, res) {
  // Save tokens for later use
  oauth2Client.getToken(req.query.code, function(err, tokens) {
    if(!err) {
      oauth2Client.setCredentials(tokens);
      res.redirect('/manage');
    } else {
      res.send(err);
    }
  });
});

// Return number of user's emails associated with contactEmail
var retrieveContactEmails = function(contactEmail, cb) {
  var endpoint = 'https://www.googleapis.com/gmail/v1/users/me/messages?q=from%3A' + querystring.escape(contactEmail) + '&fields=messages';
  request({
    url: endpoint,
    method: 'GET',
    auth: {
      bearer: oauth2Client.credentials.access_token
    },
    json: true
  }, function(err, response, body) {
    if (err) {
      console.log('Server error:', err);
    } else if (response.statusCode == 429) {
      console.error('Rate limited, trying again for', contactEmail);
      retrieveContactEmails(contactEmail, cb);
    } else if (body.messages) {
        cb(body.messages.length)
    } else {
        cb(0);
    }
  });
}

// Main page for managing/removing contacts
app.get('/manage', function(req, res) {
  // Get all user's contacts
  request({
    url: 'https://www.google.com/m8/feeds/contacts/default/full',
    auth: {
      bearer: oauth2Client.credentials.access_token
    },
    qs: {
      'max-results': 2000,
      'alt': 'json'
    },
    headers: {
      'GData-Version': '3.0'
    },
    json: true
  }, function(err, response, body) {
    var contacts = body.feed.entry;
    
    // Store stripped-down contact info
    contacts = contacts.map(function(contact) {
      var newContact = {
          gContactId: contact.id['$t'].split('/base/')[1],
      };
      
      if (contact.title['$t']) {
        newContact.name = contact.title['$t'];
      }
      
      if (contact['gd$email']) {
        newContact.email = contact['gd$email'][0].address;
        // If they have an email, retrieve associated emails and save
        retrieveContactEmails(newContact.email, function(numOfMessages) {
          newContact.numOfMessages = numOfMessages;
          
          // Save contact to DB
          newContact = new Contact(newContact);
          
          newContact.save(function(err, savedThing) {
            if (err) return console.error(err);
            console.log('saved!', savedThing)
          });
          
          return newContact
        });
      } else {
        // Else, save immediately
        // Save contact to DB
        newContact = new Contact(newContact);
        
        newContact.save(function(err, savedThing) {
          if (err) return console.error(err);
          console.log('saved!', savedThing)
        });
        return newContact
      }
    });
    
    res.render('manage', { contacts: contacts });
  });
});

app.get('/no-emails', function(req, res) {
  Contact.find({ 'numOfMessages': 0 }, function (err, docs) {
    res.send(docs)
  });
});

app.post('/delete', function(req, res) {
  // Get all contacts
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
    
    // Get recent Gmail messages
    request({
        url: 'https://www.googleapis.com/gmail/v1/users/me/messages?q=after%3A2016%2F0%2F1&fields=messages',
        method: 'GET',
        auth: {
          bearer: oauth2Client.credentials.access_token
        },
      }, function(err, response, body) {
        if (err) {
          console.error('Server error:', err);
          res.status(400).send('Error', err.message);
        }
        
        res.status(response.statusCode).send(response.statusMessage);  
      });
    });
});

app.listen(process.env.PORT, function () {
  console.log('Example app listening on port 3000!');
});