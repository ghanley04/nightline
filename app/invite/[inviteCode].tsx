/**
 * Legacy invite deep-link compatibility stub.
 *
 * The real invite-acceptance flow lives in app/(tabs)/plans.tsx — users tap
 * "Have an invite code?" and type the code (which is the final segment of
 * any shared `.../invite/<code>` URL). No automatic join happens from the
 * link itself.
 *
 * This file exists only so that any previously-generated
 * `https://nightline.app/invite/<code>` link does not 404 — it silently
 * redirects to the plans tab. Do not add logic here; all invite handling
 * belongs in plans.tsx.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import colors from '../../constants/colors';

export default function InviteRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/(tabs)/plans');
    }, [router]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
});
