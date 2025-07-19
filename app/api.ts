import { get, del, post, put } from 'aws-amplify/api';
// You might also need to import ApiError if you want to specifically check for it
import { ApiError } from 'aws-amplify/api';

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