/* eslint-disable */
const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');

const {
  addUserToGroup,
  removeUserFromGroup,
  confirmUserSignUp,
  disableUser,
  enableUser,
  getUser,
  listUsers,
  listGroups,
  listGroupsForUser,
  listUsersInGroup,
  signUserOut,
} = require('./cognitoActions');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(awsServerlessExpressMiddleware.eventContext());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token'
  );
  next();
});

// Group enforcement
const allowedGroup = process.env.GROUP;

const checkGroup = (req, res, next) => {
  if (req.path === '/signUserOut') return next();

  if (!allowedGroup || allowedGroup === 'NONE') return next();

  const claims = req.apiGateway?.event?.requestContext?.authorizer?.claims;
  if (claims && claims['cognito:groups']) {
    const groups = claims['cognito:groups'].split(',');
    if (!groups.includes(allowedGroup)) {
      const err = new Error('User does not have permissions to perform administrative tasks');
      err.statusCode = 403;
      return next(err);
    }
  } else {
    const err = new Error('User does not have permissions to perform administrative tasks');
    err.statusCode = 403;
    return next(err);
  }

  next();
};

app.all('*', checkGroup);

//////////////////////////////
// Routes
//////////////////////////////

app.post('/addUserToGroup', async (req, res, next) => {
  if (!req.body.username || !req.body.groupname) {
    const err = new Error('username and groupname are required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await addUserToGroup(req.body.username, req.body.groupname);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/removeUserFromGroup', async (req, res, next) => {
  if (!req.body.username || !req.body.groupname) {
    const err = new Error('username and groupname are required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await removeUserFromGroup(req.body.username, req.body.groupname);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/confirmUserSignUp', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await confirmUserSignUp(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/disableUser', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await disableUser(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/enableUser', async (req, res, next) => {
  if (!req.body.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await enableUser(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/getUser', async (req, res, next) => {
  if (!req.query.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await getUser(req.query.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listUsers', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listUsers(limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listGroups', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listGroups(limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listGroupsForUser', async (req, res, next) => {
  if (!req.query.username) {
    const err = new Error('username is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listGroupsForUser(req.query.username, limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.get('/listUsersInGroup', async (req, res, next) => {
  if (!req.query.groupname) {
    const err = new Error('groupname is required');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const response = await listUsersInGroup(req.query.groupname, limit, req.query.token);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

app.post('/signUserOut', async (req, res, next) => {
  const usernameFromToken = req.apiGateway.event.requestContext.authorizer.claims.username;
  if (
    req.body.username !== usernameFromToken &&
    req.body.username !== /[^/]*$/.exec(req.apiGateway.event.requestContext.identity.userArn)[0]
  ) {
    const err = new Error('only the user can sign themselves out');
    err.statusCode = 400;
    return next(err);
  }
  try {
    const response = await signUserOut(req.body.username);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Error handler (must be last)
app.use((err, req, res, next) => {
  console.error(err.message);
  if (!err.statusCode) err.statusCode = 500;
  res.status(err.statusCode).json({ message: err.message }).end();
});

// Only listen when running locally
if (process.env.NODE_ENV !== 'lambda') {
  app.listen(3000, () => console.log('App started locally on port 3000'));
}

module.exports = app;
