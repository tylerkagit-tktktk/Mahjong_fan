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

const DEPTH_BACKGROUND = 0;
const DEPTH_FOCUS = 12;

type IconName = 'settings' | 'score' | 'group' | 'join' | 'history';

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

  if (name === 'score') {
    return (
      <Svg width={size ?? 42} height={size ?? 42} viewBox="0 0 48 48" fill="none" accessibilityElementsHidden>
        <Rect x={9} y={6} width={25} height={34} rx={4} stroke={color} strokeWidth={2.8} />
        <Path d="M16 15h11M16 22h11M16 29h6" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
        <Path d="m31 34 7.5-7.5 3 3L34 37l-4 1 1-4Z" stroke={color} strokeWidth={2.6} strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'group') {
    return (
      <Svg width={size ?? 38} height={size ?? 38} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden>
        <Circle cx={14} cy={13} r={6} stroke={color} strokeWidth={2.5} />
        <Circle cx={28} cy={15} r={5} stroke={color} strokeWidth={2.5} />
        <Path d="M4 34c0-6.63 4.92-11 11-11s11 4.37 11 11" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <Path d="M23 33c0-5.52 4.03-9.5 9-9.5 2.1 0 4.03.7 5.56 1.9" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'join') {
    return (
      <Svg width={size ?? 38} height={size ?? 38} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden>
        <Path d="M15.1 25.1 24.9 15.3M12.3 30.4l-2.2 2.2a6.25 6.25 0 0 1-8.84-8.84l7.06-7.06a6.25 6.25 0 0 1 8.84 0M27.7 9.6l2.2-2.2a6.25 6.25 0 0 1 8.84 8.84l-7.06 7.06a6.25 6.25 0 0 1-8.84 0" stroke={color} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size ?? 38} height={size ?? 38} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden>
      <Path d="M7 32V22M19 32V14M31 32V7" stroke={color} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

type HomeActionRowProps = {
  testID: string;
  icon: IconName;
  iconColor: string;
  title: string;
  subtitle: string;
  primary?: boolean;
  showDivider?: boolean;
  onPress: () => void;
};

function HomeActionRow({
  testID,
  icon,
  iconColor,
  title,
  subtitle,
  primary = false,
  showDivider = false,
  onPress,
}: HomeActionRowProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}，${subtitle}`}
      style={({ pressed }) => [
        styles.actionRow,
        primary && styles.actionRowPrimary,
        showDivider && styles.actionRowDivider,
        pressed && styles.actionRowPressed,
      ]}
    >
      <View style={[styles.actionRowIcon, primary && styles.actionRowIconPrimary]}>
        <HomeActionIcon name={icon} color={iconColor} size={primary ? 44 : 38} />
      </View>
      <View style={styles.actionRowCopy}>
        <AppText style={[styles.actionRowTitle, primary && styles.actionRowTitlePrimary]}>{title}</AppText>
        <AppText style={styles.actionRowSubtitle}>{subtitle}</AppText>
      </View>
      <AppText accessibilityElementsHidden style={[styles.actionRowChevron, primary && styles.actionRowChevronPrimary]}>›</AppText>
    </Pressable>
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
    multiplayer: translateWithFallback(t, 'home.multiplayer', '多人連線'),
    createMultiplayer: translateWithFallback(t, 'home.createMultiplayer', '開多人枱'),
    createMultiplayerHint: translateWithFallback(t, 'home.createMultiplayerHint', '邀朋友加入'),
    joinMultiplayer: translateWithFallback(t, 'home.joinMultiplayer', '加入牌局'),
    joinMultiplayerHint: translateWithFallback(t, 'home.joinMultiplayerHint', '使用邀請連結'),
    historyAll: translateWithFallback(t, 'home.historyAllCantonese', '所有戰績'),
    historyAllHint: translateWithFallback(t, 'home.historyAllHint', '查看過往牌局與結果'),
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

            <HomeActionRow
              testID="home-start-local"
              icon="score"
              iconColor="#17604A"
              title={copy.startScoring}
              subtitle={copy.startScoringHint}
              primary
              onPress={() => {
                handleNewGamePress().catch((error) => {
                  console.error('[Home] Failed to start a local game', error);
                });
              }}
            />

            <View style={styles.multiplayerHeading}>
              <View style={styles.headingRule} />
              <AppText style={styles.multiplayerTitle}>{copy.multiplayer}</AppText>
              <View style={styles.headingRule} />
            </View>

            <View style={styles.actionRows}>
              <HomeActionRow
                testID="home-create-multiplayer"
                icon="group"
                iconColor="#17604A"
                title={copy.createMultiplayer}
                subtitle={copy.createMultiplayerHint}
                showDivider
                onPress={() => navigation.navigate('NewGameStepper', { entryMode: 'multiplayer' })}
              />
              <HomeActionRow
                testID="home-join-multiplayer"
                icon="join"
                iconColor="#A06A12"
                title={copy.joinMultiplayer}
                subtitle={copy.joinMultiplayerHint}
                showDivider
                onPress={() => navigation.navigate('JoinLanding')}
              />
              <HomeActionRow
                testID="home-history"
                icon="history"
                iconColor="#17604A"
                title={copy.historyAll}
                subtitle={copy.historyAllHint}
                onPress={() => navigation.navigate('History')}
              />
            </View>
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
  multiplayerHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: 20,
  },
  headingRule: {
    height: 1,
    flex: 1,
    backgroundColor: 'rgba(55, 82, 74, 0.17)',
  },
  multiplayerTitle: {
    ...typography.subtitle,
    color: '#205E4B',
    fontSize: theme.fontSize.md,
    lineHeight: 24,
    fontWeight: '600',
  },
  actionRows: {
    width: '100%',
  },
  actionRow: {
    minHeight: 80,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
  },
  actionRowPrimary: {
    minHeight: 92,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  actionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(55, 82, 74, 0.16)',
  },
  actionRowPressed: {
    backgroundColor: 'rgba(23, 96, 74, 0.08)',
  },
  actionRowIcon: {
    width: 46,
    alignItems: 'center',
    marginRight: theme.spacing.xs,
  },
  actionRowIconPrimary: {
    width: 50,
  },
  actionRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionRowTitle: {
    ...typography.subtitle,
    fontSize: theme.fontSize.lg,
    lineHeight: 24,
    fontWeight: '700',
    color: '#235A49',
  },
  actionRowTitlePrimary: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionRowSubtitle: {
    ...typography.body,
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  actionRowChevron: {
    marginLeft: theme.spacing.md,
    color: '#4D7467',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '300',
    flexShrink: 0,
  },
  actionRowChevronPrimary: {
    color: '#17604A',
    fontSize: 36,
    lineHeight: 40,
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
