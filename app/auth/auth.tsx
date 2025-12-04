import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

export async function getJwtToken() {
    try {
        // Ensures a user is logged in
        await getCurrentUser();

        const session = await fetchAuthSession();
        return String(session.tokens?.idToken ?? "");
    } catch {
        return "";
    }
}