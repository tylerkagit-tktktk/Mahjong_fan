import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import AppText from '../components/AppText';
import { endGame, listGames } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { translateWithFallback } from '../i18n/translateWithFallback';
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
const DEPTH_FOCUS = 12;

type IconName = 'settings' | 'group' | 'join';

function HomeActionIcon({ name, color, size }: { name: IconName; color: string; size?: number }) {
  if (name === 'settings') {
    return (
      <Svg width={size ?? 27} height={size ?? 27} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Path
          d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0-5.2 1 1.94c.29.1.57.22.84.36l2.07-.67 1.7 1.7-.67 2.07c.14.27.26.55.36.84l1.94 1v2.4l-1.94 1c-.1.29-.22.57-.36.84l.67 2.07-1.7 1.7-2.07-.67c-.27.14-.55.26-.84.36L12 21l-2.4-1-1-1.94a7.5 7.5 0 0 1-.84-.36l-2.07.67-1.7-1.7.67-2.07a7.5 7.5 0 0 1-.36-.84l-1.94-1v-2.4l1.94-1c.1-.29.22-.57.36-.84l-.67-2.07 1.7-1.7 2.07.67c.27-.14.55-.26.84-.36L9.6 3h2.4Z"
          stroke={color}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (name === 'group') {
    return (
      <Svg width={size ?? 38} height={size ?? 38} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden>
        <Circle cx={14} cy={13} r={6} fill={color} />
        <Circle cx={28} cy={15} r={5} fill={color} opacity={0.82} />
        <Path d="M4 33c0-6.08 4.92-11 11-11s11 4.92 11 11H4Z" fill={color} />
        <Path d="M23 32c0-4.97 4.03-9 9-9 2.1 0 4.03.72 5.56 1.93A11.08 11.08 0 0 1 40 32H23Z" fill={color} opacity={0.82} />
      </Svg>
    );
  }

  return (
    <Svg width={size ?? 38} height={size ?? 38} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden>
      <Rect x={5} y={5} width={10} height={10} rx={1.5} stroke={color} strokeWidth={3.2} />
      <Rect x={25} y={5} width={10} height={10} rx={1.5} stroke={color} strokeWidth={3.2} />
      <Rect x={5} y={25} width={10} height={10} rx={1.5} stroke={color} strokeWidth={3.2} />
      <Path d="M25 27h5v5m0-5v8m0 0h5" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
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
  const { width } = useWindowDimensions();
  const { t } = useAppLanguage();
  const [activeGamePromptVisible, setActiveGamePromptVisible] = useState(false);
  const [blockingGame, setBlockingGame] = useState<Game | null>(null);
  const [endingBlockingGame, setEndingBlockingGame] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const contentWidth = Math.min(width - theme.spacing.lg * 2, 440);

  const copy = {
    tagline: translateWithFallback(t, 'home.taglineHero', '計錢．分析．對局紀錄'),
    startScoring: translateWithFallback(t, 'home.startScoring', '開始記分'),
    startScoringHint: translateWithFallback(t, 'home.startScoringHint', '一部手機，立即開枱'),
    multiplayer: translateWithFallback(t, 'home.multiplayer', '多人同步'),
    createMultiplayer: translateWithFallback(t, 'home.createMultiplayer', '開多人枱'),
    createMultiplayerHint: translateWithFallback(t, 'home.createMultiplayerHint', '邀朋友加入'),
    joinMultiplayer: translateWithFallback(t, 'home.joinMultiplayer', '加入牌局'),
    joinMultiplayerHint: translateWithFallback(t, 'home.joinMultiplayerHint', '使用邀請連結'),
    historyAll: translateWithFallback(t, 'home.historyAllCantonese', '所有戰績'),
    settings: translateWithFallback(t, 'nav.settings', '設定'),
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
        source={require('../assets/home/home-3d-background-v1.jpg')}
        style={styles.generatedBackground}
        resizeMode="cover"
      />

      <SafeAreaView style={styles.safeContent} edges={['top', 'bottom']}>
        <View style={styles.settingsRow}>
          <Pressable
            testID="home-settings"
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel={copy.settings}
            hitSlop={8}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.iconPressed]}
          >
            <HomeActionIcon name="settings" color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
          <View style={[styles.content, { maxWidth: contentWidth }]}>
            <View style={styles.brandBlock}>
              <AppText style={styles.appTitle}>{t('home.brandTitle')}</AppText>
              <AppText style={styles.tagline}>{copy.tagline}</AppText>
            </View>

            <Pressable
              testID="home-start-local"
              onPress={handleNewGamePress}
              accessibilityRole="button"
              accessibilityLabel={`${copy.startScoring}，${copy.startScoringHint}`}
              style={({ pressed }) => [styles.primaryPressable, pressed && styles.primaryPressed]}
            >
              <View style={styles.primaryButton}>
                <View style={styles.primaryCopy}>
                  <AppText style={styles.primaryButtonTitle}>{copy.startScoring}</AppText>
                  <AppText style={styles.primaryButtonHint}>{copy.startScoringHint}</AppText>
                </View>
                <AppText style={styles.primaryChevron}>›</AppText>
              </View>
            </Pressable>

            <View style={styles.multiplayerHeading}>
              <View style={styles.headingRule} />
              <AppText style={styles.multiplayerTitle}>{copy.multiplayer}</AppText>
              <View style={styles.headingRule} />
            </View>

            <View style={styles.multiplayerRows}>
              <Pressable
                testID="home-create-multiplayer"
                onPress={() => navigation.navigate('NewGameStepper', { entryMode: 'multiplayer' })}
                accessibilityRole="button"
                accessibilityLabel={`${copy.createMultiplayer}，${copy.createMultiplayerHint}`}
                style={({ pressed }) => [styles.multiplayerRow, styles.multiplayerRowDivider, pressed && styles.secondaryPressed]}
              >
                <View style={styles.multiplayerRowIcon}>
                  <HomeActionIcon name="group" color="#287343" size={32} />
                </View>
                <View style={styles.multiplayerRowCopy}>
                  <AppText style={styles.multiplayerRowTitle}>{copy.createMultiplayer}</AppText>
                  <AppText style={styles.multiplayerRowHint}>{copy.createMultiplayerHint}</AppText>
                </View>
                <AppText style={styles.multiplayerRowChevron}>›</AppText>
              </Pressable>

              <Pressable
                testID="home-join-multiplayer"
                onPress={() => navigation.navigate('JoinLanding')}
                accessibilityRole="button"
                accessibilityLabel={`${copy.joinMultiplayer}，${copy.joinMultiplayerHint}`}
                style={({ pressed }) => [styles.multiplayerRow, pressed && styles.secondaryPressed]}
              >
                <View style={styles.multiplayerRowIcon}>
                  <HomeActionIcon name="join" color="#A06A12" size={32} />
                </View>
                <View style={styles.multiplayerRowCopy}>
                  <AppText style={styles.multiplayerRowTitle}>{copy.joinMultiplayer}</AppText>
                  <AppText style={styles.multiplayerRowHint}>{copy.joinMultiplayerHint}</AppText>
                </View>
                <AppText style={styles.multiplayerRowChevron}>›</AppText>
              </Pressable>
            </View>

            <Pressable
              testID="home-history"
              onPress={() => navigation.navigate('History')}
              accessibilityRole="button"
              accessibilityLabel={copy.historyAll}
              style={({ pressed }) => [styles.historyButton, pressed && styles.secondaryPressed]}
            >
              <AppText style={styles.historyButtonText}>{copy.historyAll}</AppText>
              <AppText style={styles.historyChevron}>›</AppText>
            </Pressable>
          </View>
        </ScrollView>
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
  settingsRow: {
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    zIndex: DEPTH_FOCUS,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    opacity: 0.52,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    zIndex: DEPTH_FOCUS,
  },
  brandBlock: {
    alignItems: 'center',
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  appTitle: {
    ...typography.title,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '800',
    color: '#174F3F',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
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
    marginTop: theme.spacing.lg,
    width: '83%',
    alignSelf: 'center',
  },
  primaryPressed: {
    opacity: 0.94,
  },
  primaryButton: {
    width: '100%',
    minHeight: 96,
    backgroundColor: '#1D5B47',
    borderRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...CTA_SHADOW,
  },
  primaryCopy: {
    flex: 1,
  },
  primaryButtonTitle: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  primaryButtonHint: {
    ...typography.body,
    marginTop: theme.spacing.xs,
    color: 'rgba(255,255,255,0.84)',
    fontSize: theme.fontSize.md,
    lineHeight: 23,
  },
  primaryChevron: {
    marginLeft: theme.spacing.md,
    color: '#FFFFFF',
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '300',
  },
  multiplayerHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.spacing.md,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  headingRule: {
    height: 1,
    flex: 1,
    backgroundColor: 'rgba(55, 82, 74, 0.22)',
  },
  multiplayerTitle: {
    ...typography.subtitle,
    color: '#205E4B',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  multiplayerRows: {
    width: '100%',
  },
  multiplayerRow: {
    minHeight: 76,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  multiplayerRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(55, 82, 74, 0.2)',
  },
  multiplayerRowIcon: {
    width: 40,
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  multiplayerRowCopy: {
    flex: 1,
  },
  multiplayerRowTitle: {
    ...typography.subtitle,
    fontSize: theme.fontSize.lg,
    lineHeight: 24,
    fontWeight: '700',
    color: '#235A49',
  },
  multiplayerRowHint: {
    ...typography.body,
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  multiplayerRowChevron: {
    marginLeft: theme.spacing.md,
    color: '#4D7467',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '300',
  },
  secondaryPressed: {
    opacity: 0.78,
  },
  historyButton: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    minHeight: 48,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  historyButtonText: {
    ...typography.subtitle,
    color: '#205E4B',
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  historyChevron: {
    marginLeft: theme.spacing.xs,
    color: '#205E4B',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '300',
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
