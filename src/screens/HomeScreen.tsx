import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { endGame, listGames } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { Game } from '../models/db';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
const ONBOARDING_SEEN_KEY = 'home_onboarding_seen_v1';

const DICE_SIZE = 64;
const PIP_SIZE = 6;
const PIP_OFFSET = 11;
const PIP_MID = (DICE_SIZE - PIP_SIZE) / 2;

const LIGHT_SOURCE = 'top-left';
const SHADOW_OFFSET_BASE = LIGHT_SOURCE === 'top-left' ? { width: 0, height: 8 } : { width: 0, height: 8 };

const TILE_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: SHADOW_OFFSET_BASE,
  elevation: 12,
} as const;

const CTA_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.16,
  shadowRadius: 10,
  shadowOffset: { width: SHADOW_OFFSET_BASE.width, height: 6 },
  elevation: 10,
} as const;

const DICE_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.2,
  shadowRadius: 14,
  shadowOffset: SHADOW_OFFSET_BASE,
  elevation: 12,
} as const;

const DEPTH_BACKGROUND = 0;
const DEPTH_ELEMENT = 2;
const DEPTH_FLOATING = 6;
const DEPTH_FOCUS = 12;

const OPACITY_BACKGROUND = 0.05;
const OPACITY_SECONDARY_ELEMENT = 0.62;
const OPACITY_FOCUS_ELEMENT = 0.76;

type PipPosition = 'TL' | 'TR' | 'BL' | 'BR' | 'C' | 'ML' | 'MR';

const DICE_PIPS: Record<number, PipPosition[]> = {
  1: ['C'],
  2: ['TL', 'BR'],
  3: ['TL', 'C', 'BR'],
  4: ['TL', 'TR', 'BL', 'BR'],
  5: ['TL', 'TR', 'C', 'BL', 'BR'],
  6: ['TL', 'ML', 'BL', 'TR', 'MR', 'BR'],
};

function pipPositionStyle(position: PipPosition) {
  switch (position) {
    case 'TL':
      return { top: PIP_OFFSET, left: PIP_OFFSET };
    case 'TR':
      return { top: PIP_OFFSET, right: PIP_OFFSET };
    case 'BL':
      return { bottom: PIP_OFFSET, left: PIP_OFFSET };
    case 'BR':
      return { bottom: PIP_OFFSET, right: PIP_OFFSET };
    case 'C':
      return { top: PIP_MID, left: PIP_MID };
    case 'ML':
      return { top: PIP_MID, left: PIP_OFFSET };
    case 'MR':
      return { top: PIP_MID, right: PIP_OFFSET };
    default:
      return {};
  }
}

function clampNumber(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function translateWithFallback(
  t: (key: TranslationKey) => string,
  key: string,
  fallback: string,
  replacements?: Record<string, string | number>,
): string {
  const raw = t(key as TranslationKey);
  const base = raw === key ? fallback : raw;
  if (!replacements) {
    return base;
  }
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value)),
    base,
  );
}

function formatElapsedLabel(game: Game, t: (key: TranslationKey) => string): string {
  const endAt = game.endedAt ?? Date.now();
  const diff = Math.max(0, endAt - game.createdAt);
  const minutes = Math.max(1, Math.floor(diff / 60000));

  if (minutes < 60) {
    return translateWithFallback(t, 'gameTable.elapsed.minutes', `已玩 ${minutes} 分鐘`, { minutes });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return translateWithFallback(t, 'gameTable.elapsed.hoursMinutes', `已玩 ${hours} 小時 ${remainingMinutes} 分鐘`, {
    hours,
    minutes: remainingMinutes,
  });
}

async function fetchLatestActiveGame(): Promise<Game | null> {
  const games = await listGames();
  return games.find((game) => game.endedAt == null) ?? null;
}

function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t } = useAppLanguage();
  const [activeGamePromptVisible, setActiveGamePromptVisible] = useState(false);
  const [blockingGame, setBlockingGame] = useState<Game | null>(null);
  const [endingBlockingGame, setEndingBlockingGame] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const ctaWidth = Math.min(width - 96, 320);
  const heroSafeTop = clampNumber(height * 0.22, insets.top + 130, insets.top + 210);
  const heroSafeBottom = clampNumber(height * 0.80, height * 0.74, height * 0.84);
  const tileRedTop = clampNumber(insets.top + 104, insets.top + 88, heroSafeTop - 30);
  const diceTop = clampNumber(insets.top + 78, insets.top + 66, heroSafeTop - 18);
  const tileGreenBottom = clampNumber(height * 0.08, 72, Math.max(92, height - heroSafeBottom - 28));
  const tileBambooBottom = clampNumber(height * 0.10, 94, Math.max(120, height - heroSafeBottom - 2));
  const depthBottom = -height * 0.28;

  const copy = {
    tagline: translateWithFallback(t, 'home.taglineHero', '計錢．分析．對局紀錄'),
    newGame: translateWithFallback(t, 'home.newGameCantonese', '開新枱'),
    historyAll: translateWithFallback(t, 'home.historyAllCantonese', '所有戰績 ›'),
    promptTitle: translateWithFallback(t, 'home.activeGameModal.title', '有局打緊喎'),
    promptMessage: translateWithFallback(t, 'home.activeGameModal.message', '你而家仲有一場牌未完：'),
    unnamedGame: translateWithFallback(t, 'home.activeGameModal.unnamedGame', '未命名對局'),
    promptHint: translateWithFallback(t, 'home.activeGameModal.hint', '同一時間只可以打一場牌。'),
    continue: translateWithFallback(t, 'home.activeGameModal.action.continue', '繼續打'),
    endThenStart: translateWithFallback(t, 'home.activeGameModal.action.endThenStart', '收枱再開新枱'),
    abandonSoon: translateWithFallback(t, 'home.activeGameModal.action.abandonSoon', '放棄呢局（稍後推出）'),
    cancel: translateWithFallback(t, 'home.activeGameModal.action.cancel', '唔搞住'),
    zeroMinutes: translateWithFallback(t, 'gameTable.elapsed.minutes', '已玩 0 分鐘', { minutes: 0 }),
  };

  const blockingGameDuration = blockingGame ? formatElapsedLabel(blockingGame, t) : copy.zeroMinutes;
  const onboardingCopy = {
    title: translateWithFallback(t, 'onboarding.title', '三步完成第一局'),
    subtitle: translateWithFallback(t, 'onboarding.subtitle', '快速上手流程'),
    stepCreate: translateWithFallback(t, 'onboarding.step.create', '1. 開新枱建立對局'),
    stepHands: translateWithFallback(t, 'onboarding.step.hands', '2. 在牌枱逐手記錄'),
    stepSummary: translateWithFallback(t, 'onboarding.step.summary', '3. 完局後查看總結與分享'),
    skip: translateWithFallback(t, 'onboarding.action.skip', '跳過'),
    continue: translateWithFallback(t, 'onboarding.action.continue', '知道了'),
    startNow: translateWithFallback(t, 'onboarding.action.startNow', '立即開新枱'),
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
        if (active && seen !== '1') {
          setShowOnboarding(true);
        }
      } catch {
        if (active) {
          setShowOnboarding(true);
        }
      }
    })().catch(() => {
      if (active) {
        setShowOnboarding(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const markOnboardingSeen = async () => {
    setShowOnboarding(false);
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    } catch (error) {
      console.warn('[Home] failed to persist onboarding flag', error);
    }
  };

  async function handleNewGamePress() {
    try {
      const activeGame = await fetchLatestActiveGame();
      if (!activeGame) {
        navigation.navigate('NewGameStepper');
        return;
      }
      setBlockingGame(activeGame);
      setActiveGamePromptVisible(true);
    } catch (error) {
      console.error('[Home] Failed to check active game', error);
    }
  }

  function handleContinueBlockingGame() {
    if (!blockingGame) return;
    setActiveGamePromptVisible(false);
    navigation.navigate('GameTable', { gameId: blockingGame.id });
  }

  async function handleEndThenStart() {
    if (!blockingGame || endingBlockingGame) return;
    try {
      setEndingBlockingGame(true);
      await endGame(blockingGame.id, Date.now());
      setActiveGamePromptVisible(false);
      setBlockingGame(null);
      navigation.navigate('NewGameStepper');
    } catch (error) {
      console.error('[Home] Failed to end active game', error);
    } finally {
      setEndingBlockingGame(false);
    }
  }

  function renderPips(faceValue: number) {
    const positions = DICE_PIPS[faceValue] ?? DICE_PIPS[1];
    return positions.map((position) => (
      <View key={position} style={[styles.diceDot, pipPositionStyle(position)]} />
    ));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.illustrationLayer} pointerEvents="none">
        <View
          style={[
            styles.topGlowOuter,
            {
              top: -height * 0.22,
              left: -width * 0.15,
              width: width * 1.3,
              height: height * 0.55,
            },
          ]}
        />
        <View
          style={[
            styles.topGlowInner,
            {
              top: -height * 0.18,
              left: -width * 0.05,
              width: width * 1.1,
              height: height * 0.45,
            },
          ]}
        />
        <View
          style={[
            styles.bottomVignetteOuter,
            {
              bottom: -height * 0.36,
              left: -width * 0.18,
              width: width * 1.45,
              height: height * 0.72,
            },
          ]}
        />
        <View
          style={[
            styles.bottomVignetteInner,
            {
              bottom: -height * 0.30,
              left: -width * 0.12,
              width: width * 1.28,
              height: height * 0.62,
            },
          ]}
        />
        <View style={styles.depthCircleTop} />
        <View style={[styles.depthCircleBottom, { bottom: depthBottom }]} />

        <View
          style={[
            styles.tile,
            styles.tileRed,
            {
              top: tileRedTop,
            },
          ]}
        >
          <View style={styles.tileHighlight} />
          <View style={styles.tileRim} />
          <Text style={[styles.tileGlyph, styles.tileGlyphRed]}>中</Text>
        </View>

        <View
          style={[
            styles.tile,
            styles.tileGreen,
            {
              bottom: tileGreenBottom,
            },
          ]}
        >
          <View style={styles.tileHighlight} />
          <View style={styles.tileRim} />
          <Text style={[styles.tileGlyph, styles.tileGlyphGreen]}>發</Text>
        </View>

        <View
          style={[
            styles.tile,
            styles.tileBambooOne,
            {
              bottom: tileBambooBottom,
            },
          ]}
        >
          <View style={styles.tileHighlight} />
          <View style={styles.tileRim} />
          <Image source={require('../assets/tiles/bamboo1.png')} style={styles.bambooImage} resizeMode="contain" />
        </View>

        <View
          style={[
            styles.diceWrap,
            {
              top: diceTop,
            },
          ]}
        >
          <View style={styles.diceContactShadow} />
          <View style={styles.diceFace}>
            <View style={styles.diceHighlight} />
            <View style={styles.diceShade} />
            {renderPips(5)}
          </View>
        </View>

      </View>

      <View style={styles.heroContainer}>
        <View style={[styles.heroFocusGlow, { width: Math.min(width * 0.95, 560) }]} pointerEvents="none" />
        <View style={styles.heroGroup}>
          <Text style={styles.brandTitle}>{t('home.brandTitle')}</Text>
          <Text style={styles.tagline}>{copy.tagline}</Text>

          <Pressable
            onPress={handleNewGamePress}
            style={({ pressed }) => [styles.primaryPressable, { width: ctaWidth }, pressed && styles.primaryPressed]}
          >
            <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{copy.newGame}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('History')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
          >
            <Text style={styles.secondaryButtonText}>{copy.historyAll}</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={activeGamePromptVisible}
        onRequestClose={() => {
          if (!endingBlockingGame) {
            setActiveGamePromptVisible(false);
          }
        }}
      >
        <View style={styles.promptBackdrop}>
          <Pressable
            style={styles.promptBackdropPressable}
            onPress={() => {
              if (!endingBlockingGame) {
                setActiveGamePromptVisible(false);
              }
            }}
          />
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>{copy.promptTitle}</Text>
            <Text style={styles.promptMessage}>{copy.promptMessage}</Text>
            <Text style={styles.promptGameTitle}>{blockingGame?.title ?? copy.unnamedGame}</Text>
            <Text style={styles.promptDuration}>{blockingGameDuration}</Text>
            <Text style={styles.promptHint}>{copy.promptHint}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.promptPrimaryButton,
                pressed && styles.promptPrimaryPressed,
                endingBlockingGame && styles.promptButtonDisabled,
              ]}
              disabled={endingBlockingGame}
              onPress={handleContinueBlockingGame}
            >
              <Text style={styles.promptPrimaryText}>{copy.continue}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.promptSecondaryButton,
                pressed && styles.promptSecondaryPressed,
                endingBlockingGame && styles.promptButtonDisabled,
              ]}
              disabled={endingBlockingGame}
              onPress={() => {
                handleEndThenStart().catch((error) => {
                  console.error('[Home] Failed to run end-then-start flow', error);
                });
              }}
            >
              <Text style={styles.promptSecondaryText}>{copy.endThenStart}</Text>
            </Pressable>

            <View style={styles.promptDisabledButton}>
              <Text style={styles.promptDisabledText}>{copy.abandonSoon}</Text>
            </View>

            <Pressable
              onPress={() => setActiveGamePromptVisible(false)}
              disabled={endingBlockingGame}
              style={({ pressed }) => [styles.promptCancelButton, pressed && styles.promptCancelPressed]}
            >
              <Text style={styles.promptCancelText}>{copy.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        animationType="fade"
        visible={showOnboarding}
        onRequestClose={() => {
          markOnboardingSeen().catch((error) => {
            console.warn('[Home] failed to close onboarding', error);
          });
        }}
      >
        <View style={styles.promptBackdrop}>
          <Pressable
            style={styles.promptBackdropPressable}
            onPress={() => {
              markOnboardingSeen().catch((error) => {
                console.warn('[Home] failed to skip onboarding', error);
              });
            }}
          />
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>{onboardingCopy.title}</Text>
            <Text style={styles.promptMessage}>{onboardingCopy.subtitle}</Text>
            <Text style={styles.onboardingStep}>{onboardingCopy.stepCreate}</Text>
            <Text style={styles.onboardingStep}>{onboardingCopy.stepHands}</Text>
            <Text style={styles.onboardingStep}>{onboardingCopy.stepSummary}</Text>

            <Pressable
              style={({ pressed }) => [styles.promptPrimaryButton, pressed && styles.promptPrimaryPressed]}
              onPress={() => {
                markOnboardingSeen().catch((error) => {
                  console.warn('[Home] failed to continue onboarding', error);
                });
              }}
            >
              <Text style={styles.promptPrimaryText}>{onboardingCopy.continue}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.promptSecondaryButton, pressed && styles.promptSecondaryPressed]}
              onPress={() => {
                markOnboardingSeen()
                  .then(() => {
                    navigation.navigate('NewGameStepper');
                  })
                  .catch((error) => {
                    console.warn('[Home] failed to start from onboarding', error);
                  });
              }}
            >
              <Text style={styles.promptSecondaryText}>{onboardingCopy.startNow}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                markOnboardingSeen().catch((error) => {
                  console.warn('[Home] failed to skip onboarding', error);
                });
              }}
              style={({ pressed }) => [styles.promptCancelButton, pressed && styles.promptCancelPressed]}
            >
              <Text style={styles.promptCancelText}>{onboardingCopy.skip}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  heroContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    transform: [{ translateY: -10 }],
    zIndex: DEPTH_FOCUS,
  },
  heroFocusGlow: {
    position: 'absolute',
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.13)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    zIndex: DEPTH_BACKGROUND + 1,
  },
  heroGroup: {
    alignItems: 'center',
    width: '100%',
    zIndex: DEPTH_ELEMENT,
  },
  brandTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 9,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  primaryPressable: {
    marginTop: 18,
    maxWidth: 320,
  },
  primaryPressed: {
    opacity: 0.93,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#355C56',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    ...CTA_SHADOW,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    marginTop: 11,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  secondaryPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  illustrationLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: DEPTH_BACKGROUND,
    pointerEvents: 'none',
  },
  topGlowOuter: {
    position: 'absolute',
    borderRadius: 999,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.048)',
    zIndex: DEPTH_BACKGROUND,
  },
  topGlowInner: {
    position: 'absolute',
    borderRadius: 999,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    zIndex: DEPTH_BACKGROUND,
  },
  bottomVignetteOuter: {
    position: 'absolute',
    borderRadius: 999,
    aspectRatio: 1,
    backgroundColor: 'rgba(0,0,0,0.011)',
    zIndex: DEPTH_BACKGROUND,
  },
  bottomVignetteInner: {
    position: 'absolute',
    borderRadius: 999,
    aspectRatio: 1,
    backgroundColor: 'rgba(0,0,0,0.006)',
    zIndex: DEPTH_BACKGROUND,
  },
  depthCircleBottom: {
    position: 'absolute',
    width: '78%',
    aspectRatio: 1,
    borderRadius: 999,
    left: '-48%',
    backgroundColor: `rgba(53, 92, 86, ${OPACITY_BACKGROUND})`,
    zIndex: DEPTH_BACKGROUND + 1,
  },
  depthCircleTop: {
    position: 'absolute',
    width: '86%',
    aspectRatio: 1,
    borderRadius: 999,
    top: '-24%',
    right: '-14%',
    backgroundColor: 'rgba(53, 92, 86, 0.06)',
    zIndex: DEPTH_BACKGROUND + 1,
  },
  tile: {
    position: 'absolute',
    width: 100,
    height: 136,
    borderRadius: 22,
    backgroundColor: '#F8F8F6',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...TILE_SHADOW,
    overflow: 'visible',
  },
  tileHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    opacity: 0.25,
  },
  tileRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  tileRed: {
    left: -52,
    width: 108,
    height: 154,
    opacity: 0.8,
    zIndex: DEPTH_ELEMENT,
    transform: [{ perspective: 1000 }, { rotateX: '1deg' }, { rotateZ: '-8deg' }],
  },
  tileGreen: {
    right: -44,
    width: 136,
    height: 180,
    opacity: OPACITY_SECONDARY_ELEMENT,
    zIndex: DEPTH_BACKGROUND + 1,
    transform: [{ perspective: 1000 }, { rotateX: '1deg' }, { rotateZ: '8deg' }],
  },
  tileBambooOne: {
    left: 6,
    width: 112,
    height: 154,
    opacity: OPACITY_FOCUS_ELEMENT,
    zIndex: DEPTH_FLOATING,
    transform: [{ perspective: 1000 }, { rotateX: '1deg' }, { rotateZ: '-6deg' }],
  },
  bambooImage: {
    width: 58,
    height: 84,
  },
  tileGlyph: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '800',
  },
  tileGlyphRed: {
    color: '#D94141',
  },
  tileGlyphGreen: {
    color: '#2E8B57',
  },
  diceWrap: {
    position: 'absolute',
    right: 24,
    zIndex: DEPTH_FLOATING - 1,
    transform: [{ perspective: 900 }, { rotateX: '6deg' }, { rotateY: '-6deg' }, { rotateZ: '6deg' }],
    opacity: 1,
    ...DICE_SHADOW,
  },
  diceContactShadow: {
    position: 'absolute',
    bottom: -5,
    left: 10,
    right: 6,
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.10)',
    transform: [{ translateX: 2 }, { scaleX: 0.91 }, { scaleY: 0.82 }],
    zIndex: 0,
  },
  diceFace: {
    width: DICE_SIZE,
    height: DICE_SIZE,
    zIndex: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  diceHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    opacity: 0.14,
  },
  diceShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '44%',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.06)',
    opacity: 0.09,
  },
  diceDot: {
    position: 'absolute',
    width: PIP_SIZE,
    height: PIP_SIZE,
    borderRadius: PIP_SIZE / 2,
    backgroundColor: '#2A2A2A',
    opacity: 0.9,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  promptBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.26)',
  },
  promptBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  promptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  promptTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  promptMessage: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  onboardingStep: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  promptGameTitle: {
    marginTop: 4,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  promptDuration: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  promptHint: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  promptPrimaryButton: {
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  promptPrimaryPressed: {
    opacity: 0.92,
  },
  promptPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  promptSecondaryButton: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  promptSecondaryPressed: {
    opacity: 0.85,
  },
  promptSecondaryText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  promptDisabledButton: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    opacity: 0.75,
  },
  promptDisabledText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  promptCancelButton: {
    marginTop: theme.spacing.sm,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  promptCancelPressed: {
    opacity: 0.65,
  },
  promptCancelText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  promptButtonDisabled: {
    opacity: 0.6,
  },
});

export default HomeScreen;
