import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import colors from '@/constants/colors';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  style,
  textStyle,
  ...props
}) => {
  const getButtonStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':   return styles.primaryButton;
      case 'secondary': return styles.secondaryButton;
      case 'outline':   return styles.outlineButton;
      case 'text':      return styles.textButton;
      case 'danger':    return styles.dangerButton;
      default:          return styles.primaryButton;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary':   return styles.primaryText;
      case 'secondary': return styles.secondaryText;
      case 'outline':   return styles.outlineText;
      case 'text':      return styles.textButtonText;
      case 'danger':    return styles.dangerText;
      default:          return styles.primaryText;
    }
  };

  const getSizeStyle = (): ViewStyle => {
    switch (size) {
      case 'small':  return styles.smallButton;
      case 'medium': return styles.mediumButton;
      case 'large':  return styles.largeButton;
      default:       return styles.mediumButton;
    }
  };

  const getTextSizeStyle = (): TextStyle => {
    switch (size) {
      case 'small':  return styles.smallText;
      case 'medium': return styles.mediumText;
      case 'large':  return styles.largeText;
      default:       return styles.mediumText;
    }
  };

  const spinnerColor =
    variant === 'outline' || variant === 'text'
      ? colors.primary
      : variant === 'secondary'
      ? colors.text
      : colors.background;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        getButtonStyle(),
        getSizeStyle(),
        (disabled || loading) && styles.disabledButton,
        style,
      ]}
      activeOpacity={0.75}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <Text
          style={[
            styles.text,
            getTextStyle(),
            getTextSizeStyle(),
            disabled && styles.disabledText,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Variants
  primaryButton: {
    backgroundColor: colors.primary,
    shadowColor: colors.shadowGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  textButton: {
    backgroundColor: 'transparent',
  },
  dangerButton: {
    backgroundColor: colors.errorDim,
    borderWidth: 1,
    borderColor: colors.error,
  },

  // Sizes
  smallButton:  { paddingVertical: 8,  paddingHorizontal: 16 },
  mediumButton: { paddingVertical: 13, paddingHorizontal: 24 },
  largeButton:  { paddingVertical: 17, paddingHorizontal: 32 },

  // Text base
  text: {
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  primaryText:    { color: '#0A0A0F' },   // dark text on gold
  secondaryText:  { color: colors.text },
  outlineText:    { color: colors.primary },
  textButtonText: { color: colors.primary },
  dangerText:     { color: colors.error },

  smallText:  { fontSize: 14 },
  mediumText: { fontSize: 16 },
  largeText:  { fontSize: 18 },

  disabledButton: { opacity: 0.4 },
  disabledText:   { opacity: 0.6 },
});

export default Button;