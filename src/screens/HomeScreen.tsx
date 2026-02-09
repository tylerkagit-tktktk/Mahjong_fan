import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { RootStackParamList, RootTabParamList } from '../navigation/types';
import theme from '../theme/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

const primaryGlow = 'rgba(43, 122, 120, 0.14)';
const primaryGlowSoft = 'rgba(43, 122, 120, 0.10)';

function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();

  return (
    <SafeAreaView
      style={[
        styles.container,
        { paddingTop: insets.top + theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.lg },
      ]}
      edges={[]}
    >
      <View style={styles.canvas}>
        <View style={[styles.glow, styles.glowA]} />
        <View style={[styles.glow, styles.glowB]} />

        <View style={styles.contentWrap}>
          <View style={styles.tileLayer} pointerEvents="none">
            <View style={[styles.tile, styles.tileRed]}>
              <View style={styles.tileGloss} />
              <View style={styles.tileDepth} />
              <Text style={[styles.tileGlyph, styles.tileGlyphRed]}>中</Text>
            </View>

            <View style={[styles.tile, styles.tileGreen]}>
              <View style={styles.tileGloss} />
              <View style={styles.tileDepth} />
              <Text style={[styles.tileGlyph, styles.tileGlyphGreen]}>發</Text>
            </View>

            <View style={[styles.tile, styles.tileWhite]}>
              <View style={styles.tileGloss} />
              <View style={styles.tileDepth} />
              <View style={styles.tileWhiteFrame} />
            </View>

            <View style={[styles.tile, styles.tileNine]}>
              <View style={styles.tileGloss} />
              <View style={styles.tileDepth} />
              <Text style={styles.tileNineTop}>九</Text>
              <Text style={styles.tileNineBottom}>萬</Text>
            </View>

            <View style={styles.dice}>
              <View style={styles.diceGloss} />
              <View style={[styles.diceDot, styles.diceDotTL]} />
              <View style={[styles.diceDot, styles.diceDotTR]} />
              <View style={[styles.diceDot, styles.diceDotCenter]} />
              <View style={[styles.diceDot, styles.diceDotBL]} />
              <View style={[styles.diceDot, styles.diceDotBR]} />
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.titleBlock}>
              <Text style={styles.brandTitle}>{t('home.brandTitle')}</Text>
              <Text style={styles.tagline}>{t('home.tagline')}</Text>
            </View>

            <View style={styles.ctaBlock}>
              <View style={styles.ctaPlate}>
                <AppButton
                  label={t('home.newGame')}
                  onPress={() => navigation.navigate('NewGameStepper')}
                  style={styles.primaryAction}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  canvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowA: {
    width: '86%',
    aspectRatio: 1,
    backgroundColor: primaryGlow,
    top: '-22%',
    right: '-34%',
  },
  glowB: {
    width: '78%',
    aspectRatio: 1,
    backgroundColor: primaryGlowSoft,
    bottom: '-24%',
    left: '-30%',
  },
  contentWrap: {
    width: '100%',
    maxWidth: 440,
    position: 'relative',
    minHeight: 420,
  },
  tileLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    overflow: 'visible',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
  },
  ctaBlock: {
    width: '100%',
    marginBottom: theme.spacing.md,
  },
  brandTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tagline: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: 0,
    textAlign: 'center',
  },
  ctaPlate: {
    width: '100%',
    borderRadius: 999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryAction: {
    width: '100%',
    maxWidth: 420,
  },
  tile: {
    position: 'absolute',
    width: 110,
    height: 150,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 11 },
    elevation: 3,
    overflow: 'hidden',
  },
  tileRed: {
    top: -64,
    left: -34,
    transform: [{ rotate: '-12deg' }],
    zIndex: 1,
  },
  tileGreen: {
    top: 94,
    right: -34,
    transform: [{ rotate: '10deg' }],
    zIndex: 1,
  },
  tileWhite: {
    width: 92,
    height: 126,
    opacity: 0.76,
    bottom: 96,
    left: -22,
    transform: [{ rotate: '-7deg' }],
    zIndex: 0,
  },
  tileNine: {
    width: 94,
    height: 130,
    top: 468,
    right: 34,
    transform: [{ rotate: '11deg' }],
    zIndex: 0,
    opacity: 0.92,
  },
  tileGlyph: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '800',
  },
  tileGlyphRed: {
    color: '#D94141',
  },
  tileGlyphGreen: {
    color: '#2E8B57',
  },
  tileWhiteFrame: {
    width: 44,
    height: 62,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: 'rgba(60, 110, 180, 0.42)',
  },
  tileNineTop: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '700',
    color: '#111111',
  },
  tileNineBottom: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '700',
    color: '#E11D2A',
    marginTop: 0,
  },
  tileGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  tileDepth: {
    position: 'absolute',
    right: 0,
    top: 6,
    bottom: 6,
    width: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  dice: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    right: 18,
    top: -30,
    transform: [{ rotate: '8deg' }],
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
    zIndex: 0,
    overflow: 'hidden',
  },
  diceGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  diceDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#222222',
    opacity: 0.88,
  },
  diceDotTL: {
    top: 11,
    left: 11,
  },
  diceDotTR: {
    top: 11,
    right: 11,
  },
  diceDotCenter: {
    top: 26,
    left: 26,
  },
  diceDotBL: {
    bottom: 11,
    left: 11,
  },
  diceDotBR: {
    bottom: 11,
    right: 11,
  },
});

export default HomeScreen;
