import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { post } from 'aws-amplify/api';
import colors from '../../constants/colors';

export default function InvitePage() {
    const { inviteCode } = useLocalSearchParams<{ inviteCode: string }>();
    const { authStatus, user } = useAuthenticator(context => [context.authStatus, context.user]);
    const router = useRouter();

    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    interface AcceptInviteResponse {
        alreadyMember?: boolean;
        success?: boolean;
        message?: string;
    }


    // Auto-join once authenticated
    useEffect(() => {
        const acceptInvite = async () => {
            if (authStatus === 'authenticated' && user && !joining && inviteCode) {
                setJoining(true);
                console.log('🎫 [ACCEPT_INVITE] Starting invite acceptance for groupId:', inviteCode);

                try {
                    // Get user attributes from Cognito
                    const userAttributes = await fetchUserAttributes();
                    console.log('👤 [ACCEPT_INVITE] User attributes fetched');

                    const userName = `${userAttributes.given_name || ''} ${userAttributes.family_name || ''}`.trim() || userAttributes.preferred_username || 'Unknown User';
                    const email = userAttributes.email;
                    const phoneNumber = userAttributes.phone_number;

                    console.log('📤 [ACCEPT_INVITE] Calling acceptInvite API...');

                    const rawData = await post({
                        apiName: 'apiNightline',
                        path: '/acceptInvite',

                        options: {
                            body: {
                                groupId: inviteCode,
                                userId: user.userId,
                                userName,
                                email: email ?? null,
                                phoneNumber: phoneNumber ?? null,
                            }
                        },
                    });

                    const { body } = await rawData.response;
                    const json = await body.json();
                    const result = json as unknown as AcceptInviteResponse;

                    Alert.alert(
                        'Success!',
                        result.alreadyMember
                            ? `You're already a member of this group`
                            : `You've successfully joined the group!`,
                        [
                            {
                                text: 'OK',
                                onPress: () => router.replace('/(tabs)'),
                            },
                        ]
                    );

                } catch (err) {
                    console.error('❌ [ACCEPT_INVITE] Error accepting invite:', err);
                    console.error('❌ [ACCEPT_INVITE] Error details:', JSON.stringify(err, null, 2));
                    setError(err instanceof Error ? err.message : 'Failed to accept invite');
                    setJoining(false);
                }
            }
        };

        acceptInvite();
    }, [authStatus, user, joining, inviteCode, router]);

    // Redirect to auth if not logged in
    useEffect(() => {
        if (authStatus === 'unauthenticated') {
            // User will see Authenticator from root layout
            // After auth, they'll come back here and auto-join
            console.log('🔐 [ACCEPT_INVITE] User not authenticated, waiting for login...');
        }
    }, [authStatus]);

    // Error state
    if (error) {
        return (
            <LinearGradient colors={[colors.secondary, '#222222']} style={styles.container}>
                <View style={styles.centerContent}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
            </LinearGradient>
        );
    }

    // Joining state
    if (joining || authStatus === 'authenticated') {
        return (
            <LinearGradient colors={[colors.secondary, '#222222']} style={styles.container}>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Joining group...</Text>
                </View>
            </LinearGradient>
        );
    }

    // Waiting for authentication
    return (
        <LinearGradient colors={[colors.secondary, '#222222']} style={styles.container}>
            <View style={styles.centerContent}>
                <View style={styles.inviteCard}>
                    <Text style={styles.title}>You've been invited!</Text>
                    <Text style={styles.instructionText}>
                        Sign in or create an account to join this group
                    </Text>
                </View>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    inviteCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: 16,
        textAlign: 'center',
    },
    instructionText: {
        fontSize: 14,
        color: colors.placeholder,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    loadingText: {
        color: colors.placeholder,
        fontSize: 16,
        marginTop: 16,
    },
    errorText: {
        color: '#FF6B6B',
        fontSize: 18,
        textAlign: 'center',
    },
});
