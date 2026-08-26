import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';

interface VirtualIDCardProps {
  studentName: string;
  fatherName: string;
  batch: string;
  enrollmentId: string;
  phone: string;
  coachingName: string;
  coachingLogo?: string;
  photoUrl?: string;
  qrValue: string;
  feeAmount: number;
  feeStatus: 'paid' | 'unpaid' | 'overdue';
  nextDueDate: string;
  admissionDate: string;
  onQRPress?: () => void;
  course?: string;
  validFrom?: string;
  validTill?: string;
  dob?: string;
  address?: string;
}

export default function VirtualIDCard({
  studentName,
  fatherName,
  batch,
  enrollmentId,
  phone,
  coachingName,
  coachingLogo,
  photoUrl,
  qrValue,
  feeAmount,
  feeStatus,
  nextDueDate,
  admissionDate,
  onQRPress,
  course = 'B.Tech CS',
  validFrom = '01/26',
  validTill = '05/28',
  dob = '15 Mar 2001',
  address = 'Indore, MP',
}: VirtualIDCardProps) {
  const rotation = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardHeight, setCardHeight] = useState(240);

  const toggleFlip = () => {
    const newValue = isFlipped ? 0 : 180;
    rotation.value = withTiming(newValue, {
      duration: 600,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    });
    setIsFlipped(!isFlipped);
  };

  const handleLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height && height > 0) {
      setCardHeight(height);
    }
  };

  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const feeStatusConfig = {
    paid: { label: 'PAID', icon: 'checkmark-circle' as const, color: Colors.status.success },
    unpaid: { label: 'DUE', icon: 'time' as const, color: Colors.status.warning },
    overdue: { label: 'OVERDUE', icon: 'alert-circle' as const, color: Colors.status.danger },
  };

  const statusInfo = feeStatusConfig[feeStatus];

  return (
    <View style={styles.cardContainer} onLayout={handleLayout}>
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={toggleFlip}
        style={styles.touchableWrapper}
      >
        {/* FRONT FACE */}
        <Animated.View style={[styles.cardFace, frontAnimatedStyle]}>
          <View style={styles.card}>
            {/* Corner decoration blobs */}
            <View style={styles.cornerDecor} />
            <View style={styles.cornerDecorBottom} />

            {/* Top Bar: Institute Info */}
            <View style={styles.topBar}>
              <View style={styles.coachingInfo}>
                <View style={styles.miniLogo}>
                  <Ionicons name="school" size={14} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.coachingName} numberOfLines={1}>
                    {coachingName}
                  </Text>
                  <Text style={styles.idBadgeText}>Student Identity Card</Text>
                </View>
              </View>
              <Ionicons name="wifi" size={18} color={Colors.accent.primary} style={styles.wifiIcon} />
            </View>

            {/* Main Content: Photo + Core Details */}
            <View style={styles.mainContent}>
              {/* Photo */}
              <View style={styles.photoSection}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="person" size={32} color={Colors.text.tertiary} />
                  </View>
                )}
              </View>

              {/* Identity Details */}
              <View style={styles.detailsSection}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {studentName}
                </Text>
                
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>ENROLLMENT ID</Text>
                  <Text style={styles.enrollmentValue} numberOfLines={1}>{enrollmentId}</Text>
                </View>
                
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>COURSE</Text>
                  <Text style={styles.columnValue} numberOfLines={1}>{course}</Text>
                </View>
              </View>
            </View>

            {/* Bottom Info Row: Valid From / Valid Till / DOB */}
            <View style={styles.bottomInfoRow}>
              <View style={styles.bottomInfoItem}>
                <Text style={styles.detailLabel}>VALID FROM</Text>
                <Text style={styles.bottomInfoValue}>{validFrom}</Text>
              </View>
              <View style={styles.bottomInfoDivider} />
              <View style={styles.bottomInfoItem}>
                <Text style={styles.detailLabel}>VALID TILL</Text>
                <Text style={styles.bottomInfoValue}>{validTill}</Text>
              </View>
              <View style={styles.bottomInfoDivider} />
              <View style={styles.bottomInfoItem}>
                <Text style={styles.detailLabel}>DOB</Text>
                <Text style={styles.bottomInfoValue} numberOfLines={1}>{dob}</Text>
              </View>
              <TouchableOpacity
                style={styles.qrButtonContainer}
                onPress={(e) => {
                  e.stopPropagation();
                  toggleFlip();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="qr-code" size={14} color={Colors.accent.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* BACK FACE */}
        <Animated.View
          style={[styles.cardFace, styles.backFace, backAnimatedStyle]}
        >
          <View style={styles.card}>
            <View style={styles.cornerDecor} />
            <View style={styles.cornerDecorBottom} />

            <View style={styles.backContent}>
              {/* QR Code Section */}
              <View style={styles.qrContainer}>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={qrValue}
                    size={cardHeight * 0.35}
                    backgroundColor="white"
                    color={Colors.text.primary}
                  />
                </View>
                <Text style={styles.qrHint}>Tap card to flip back</Text>
              </View>

              {/* Right Side: Additional Info + Fee */}
              <View style={styles.backRightSection}>
                {/* Address */}
                <View style={styles.backInfoCard}>
                  <View style={styles.backInfoRow}>
                    <Ionicons name="location-outline" size={11} color={Colors.text.tertiary} style={{ marginRight: 4 }} />
                    <Text style={styles.backInfoLabel}>ADDRESS</Text>
                  </View>
                  <Text style={styles.backInfoValue} numberOfLines={2}>{address}</Text>
                </View>

                {/* Fee Status */}
                <View style={styles.feeSection}>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Fee</Text>
                    <Text style={styles.feeAmount}>₹{feeAmount.toLocaleString()}</Text>
                  </View>
                  <View style={styles.feeDivider} />
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Due</Text>
                    <Text style={styles.feeDate}>{nextDueDate}</Text>
                  </View>
                  <View style={styles.feeDivider} />
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Status</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusInfo.color + '15' },
                      ]}
                    >
                      <Ionicons name={statusInfo.icon} size={10} color={statusInfo.color} style={{ marginRight: 3 }} />
                      <Text
                        style={[styles.statusText, { color: statusInfo.color }]}
                      >
                        {statusInfo.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    aspectRatio: 1.586,
    alignSelf: 'stretch',
    maxWidth: 440,
    ...Shadows.md,
  },
  touchableWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backFace: {},
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6BEB4',
    overflow: 'hidden',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    height: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  coachingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  miniLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  coachingName: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  idBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.accent.primary,
    marginTop: 1,
  },
  wifiIcon: {
    transform: [{ rotate: '90deg' }],
  },
  mainContent: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    zIndex: 10,
  },
  photoSection: {},
  photo: {
    width: 72,
    height: 88,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    backgroundColor: Colors.bg.tertiary,
  },
  photoPlaceholder: {
    width: 72,
    height: 88,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E6BEB4',
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsSection: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.3,
  },
  detailBlock: {
    marginTop: 1,
  },
  detailLabel: {
    color: Colors.text.tertiary,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  enrollmentValue: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  columnValue: {
    color: Colors.text.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  // Bottom info row with Valid From / Valid Till / DOB
  bottomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1ED',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    zIndex: 10,
    gap: 6,
  },
  bottomInfoItem: {
    flex: 1,
  },
  bottomInfoValue: {
    color: Colors.text.primary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  bottomInfoDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E6BEB4',
  },
  qrButtonContainer: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6BEB4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  cornerDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: 120,
    borderBottomLeftRadius: 120,
    backgroundColor: '#FBDCD4',
    opacity: 0.4,
  },
  cornerDecorBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 90,
    height: 90,
    borderTopRightRadius: 90,
    backgroundColor: '#FFF1ED',
    opacity: 0.6,
  },
  // Back face styles
  backContent: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'stretch',
    gap: 12,
    zIndex: 10,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrapper: {
    padding: 6,
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  qrHint: {
    fontSize: 8,
    color: Colors.text.tertiary,
    marginTop: 4,
    fontWeight: '600',
  },
  backRightSection: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 6,
  },
  backInfoCard: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: Colors.card.border,
  },
  backInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  backInfoLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.5,
  },
  backInfoValue: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.primary,
    lineHeight: 14,
  },
  feeSection: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    padding: 8,
    flex: 1,
    gap: 3,
    borderWidth: 0.5,
    borderColor: Colors.card.border,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeLabel: {
    fontSize: 9,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  feeAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  feeDate: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  feeDivider: {
    height: 0.5,
    backgroundColor: Colors.card.border,
    marginVertical: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '700',
  },
});
