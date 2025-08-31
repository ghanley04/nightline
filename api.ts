import { get, del, post, put } from 'aws-amplify/api';
// You might also need to import ApiError if you want to specifically check for it
import { ApiError } from 'aws-amplify/api';
import { signOut } from 'aws-amplify/auth';

const apiName = 'apiREST'; // Replace with your actual API name


import { fetchAuthSession } from 'aws-amplify/auth';

async function currentSession() {
  try {
    const { accessToken, idToken } = (await fetchAuthSession()).tokens ?? {};
  } catch (err) {
    console.log(err);
  }
}