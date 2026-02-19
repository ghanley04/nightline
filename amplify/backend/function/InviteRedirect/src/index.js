exports.handler = async (event) => {
    // Grab the inviteCode from the URL path
    const inviteCode = event.pathParameters?.inviteCode;

    if (!inviteCode) {
        return {
            statusCode: 400,
            body: "Missing invite code",
        };
    }

    // Custom scheme to open your app
    const redirectUrl = `nightline://invite/${inviteCode}`;

    return {
        statusCode: 302, // HTTP redirect
        headers: {
            Location: redirectUrl,
        },
    };
};
