import { get, del, post, put } from 'aws-amplify/api';
// You might also need to import ApiError if you want to specifically check for it
import { ApiError } from 'aws-amplify/api';

const apiName = 'apiREST'; // Replace with your actual API name

export async function addUser(profileData: any) {
  try {
    const restOperation = post({ // Let TypeScript infer the type
        apiName: 'apiRest',
        path: '/profile',
        options: {
          body: profileData
        }
      });

    const { body } = await restOperation.response;
    const response = await body.json();

    // Check if the backend response itself indicates an error,
    // assuming your backend sends a non-2xx status but still a JSON body
    // that might indicate an error (e.g., success: false, or an errorMessage field).
    // This is optional and depends on your backend's error structure for 2xx responses.
    if (response && response.success === false) {
      throw new Error(response.message || 'Backend reported a non-successful operation.');
    }

    console.log('Amplify POST call succeeded:', response);
    return response; // Return the response from your backend on success
  } catch (e) {
    console.error('Amplify POST call failed (raw error):', e);
    
    let errorMessage = 'An unexpected error occurred.';

    // Attempt to parse the error from Amplify's structured error object
    if (e && e.response && e.response.body) {
      try {
        const errorBody = JSON.parse(e.response.body);
        // Assuming your backend sends an error message in 'message' or 'error' field
        errorMessage = errorBody.message || errorBody.error || errorMessage;
        console.error('Backend error details:', errorBody);
      } catch (parseError) {
        // If parsing fails, it might be a non-JSON error or a network issue
        errorMessage = 'Failed to connect to the server or parse its response.';
        console.error('Error parsing backend response body:', parseError);
      }
    } else if (e.message) {
      // Catch other JavaScript errors or network issues
      errorMessage = e.message;
    }
    // Re-throw a new Error with a clearer message for the calling function
    throw new Error(errorMessage);
  }
}