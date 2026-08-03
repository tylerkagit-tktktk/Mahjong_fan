import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { endGame, listGames } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { Game } from '../models/db';
import { RootStackParamList } from '../navigation/types';
import { ensureSession, getCurrentSession } from '../services/cloud/authRepo';
import { getRoom } from '../services/cloud/roomRepo';
import {
  clearActiveJoinedRoomPointer,
  loadActiveJoinedRoomPointer,
} from '../services/cloud/storage';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
const ONBOARDING_SEEN_KEY = 'home_onboarding_seen_v1';

const CTA_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.16,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 6 },
  elevation: 10,
} as const;

const DEPTH_BACKGROUND = 0;
const DEPTH_ELEMENT = 2;
const DEPTH_FOCUS = 12;

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
  const { width, height } = useWindowDimensions();
  const { t } = useAppLanguage();
  const [activeGamePromptVisible, setActiveGamePromptVisible] = useState(false);
  const [blockingGame, setBlockingGame] = useState<Game | null>(null);
  const [endingBlockingGame, setEndingBlockingGame] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const ctaWidth = Math.min(width - 96, 320);
  const heroCardMaxWidth = width * 0.88;
  const heroCardMaxHeight = height * 0.38;

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

  useEffect(() => {
    let active = true;

    const recoverJoinedRoom = async () => {
      const pointer = await loadActiveJoinedRoomPointer();
      if (!pointer) return;

      const session = (await getCurrentSession()) ?? (await ensureSession());
      if (!active) return;

      if (session.uid !== pointer.uid) {
        await clearActiveJoinedRoomPointer(pointer);
        return;
      }

      const room = await getRoom(pointer.roomId);
      if (!active) return;

      if (!room) {
        await clearActiveJoinedRoomPointer(pointer);
        return;
      }

      if (room.status === 'cancelling') {
        await clearActiveJoinedRoomPointer(pointer);
        return;
      }

      if (room.status === 'open') {
        navigation.replace('RoomLobby', { roomId: room.roomId });
        return;
      }

      if (room.status === 'active' || room.status === 'ended' || room.status === 'archived') {
        navigation.replace('MultiplayerGameTable', { roomId: room.roomId });
      }
    };

    recoverJoinedRoom().catch((error) => {
      console.warn('[Home] failed to recover joined room', error);
    });

    return () => {
      active = false;
    };
  }, [navigation]);

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

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/home/home-3d-background-v1.png')}
        style={styles.generatedBackground}
        resizeMode="cover"
      />

      <SafeAreaView style={styles.safeContent} edges={['top', 'bottom']}>
        <View style={styles.heroContainer}>
          <View
            style={[
              styles.heroCard,
              {
                maxWidth: heroCardMaxWidth,
                maxHeight: heroCardMaxHeight,
              },
            ]}
          >
            <View style={styles.heroGroup}>
              <Text style={styles.appTitle}>{t('home.brandTitle')}</Text>
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
        </View>
      </SafeAreaView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  generatedBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: DEPTH_BACKGROUND,
  },
  safeContent: {
    flex: 1,
  },
  heroContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: DEPTH_FOCUS,
  },
  heroCard: {
    width: '88%',
    alignSelf: 'center',
  },
  heroGroup: {
    alignItems: 'center',
    width: '100%',
    zIndex: DEPTH_ELEMENT,
  },
  appTitle: {
    ...typography.title,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  tagline: {
    ...typography.body,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  primaryPressable: {
    marginTop: 26,
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
    ...typography.button,
    color: '#FFFFFF',
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
    ...typography.body,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
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
    ...typography.title,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  promptMessage: {
    marginTop: theme.spacing.sm,
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  onboardingStep: {
    marginTop: theme.spacing.xs,
    ...typography.body,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  promptGameTitle: {
    marginTop: 4,
    ...typography.subtitle,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  promptDuration: {
    marginTop: 2,
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  promptHint: {
    marginTop: theme.spacing.sm,
    ...typography.body,
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
    ...typography.button,
    color: theme.colors.surface,
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
    ...typography.button,
    color: theme.colors.primary,
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
    ...typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  promptButtonDisabled: {
    opacity: 0.6,
  },
});

export default HomeScreen;
