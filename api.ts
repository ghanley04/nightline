import { get, del, post, put } from 'aws-amplify/api';
// You might also need to import ApiError if you want to specifically check for it
import { ApiError } from 'aws-amplify/api';
import { signOut } from 'aws-amplify/auth';

const apiName = 'apiREST'; // Replace with your actual API name

export async function addUser(profileData: any) {
  try {
    const restOperation = post({ // Let TypeScript infer the type
      apiName: 'apiREST',
      path: '/profile',
      options: {
        body: profileData
      }
    });

    const { body } = await restOperation.response;
    const responseData = await body.json(); // Parse the JSON response body

    console.log('Amplify API POST successful:', responseData);
    return responseData; // Return the parsed response data

  } catch (error) {
    // Log the full error to understand what went wrong
    console.error('Amplify API POST failed for addUser:', error);

    // Re-throw the error so it can be caught by the calling function (e.g., handleSignUp)
    // and display a user-friendly message.
    throw new Error(`Failed to add user: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleSignOut() {
  try {
    await signOut();
  } catch (error) {
    console.log('error signing out: ', error);
  }
}



import { signIn, type SignInInput } from 'aws-amplify/auth';

async function handleSignIn({ username, password }: SignInInput) {
  try {
    const { isSignedIn, nextStep } = await signIn({ username, password });
  } catch (error) {
    console.log('error signing in', error);
  }
}

import { autoSignIn } from 'aws-amplify/auth';

async function handleAutoSignIn() {
  try {
    const signInOutput = await autoSignIn();
    // handle sign-in steps
  } catch (error) {
    console.log(error);
  }
}


import { signUp } from 'aws-amplify/auth';

type SignUpParameters = {
  username: string;
  password: string;
  email: string;
  phone_number: string;
};

async function handleSignUp({
  username,
  password,
  email,
  phone_number
}: SignUpParameters) {
  try {
    const { isSignUpComplete, userId, nextStep } = await signUp({
      username,
      password,
      options: {
        userAttributes: {
          email,
          phone_number // E.164 number convention
        },
        // optional
        autoSignIn: true // or SignInOptions e.g { authFlowType: "USER_SRP_AUTH" }
      }
    });

    console.log(userId);
  } catch (error) {
    console.log('error signing up:', error);
  }
}