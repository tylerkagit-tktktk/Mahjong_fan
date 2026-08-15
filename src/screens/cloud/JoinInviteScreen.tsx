import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../../components/AppText';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { translateWithFallback } from '../../i18n/translateWithFallback';
import { RootStackParamList } from '../../navigation/types';
import { ensureSession } from '../../services/cloud/authRepo';
import { joinWithInvite } from '../../services/cloud/roomRepo';
import { typography } from '../../styles/typography';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinInvite'>;

type JoinState = 'loading' | 'missingParams' | 'invalidInvite' | 'roomFull' | 'roomEnded' | 'error';

function normalizeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function JoinInviteScreen({ navigation, route }: Props) {
  const { t } = useAppLanguage();
  const roomId = normalizeParam(route.params?.roomId).trim();
  const token = normalizeParam(route.params?.token).trim();
  const [state, setState] = useState<JoinState>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function joinInvite() {
      if (!roomId || !token) {
        setState('missingParams');
        return;
      }

      setState('loading');
      setDetail('');
      try {
        const session = await ensureSession();
        const result = await joinWithInvite(roomId, token, session.uid);
        if (cancelled) {
          return;
        }
        if (result.ok) {
          navigation.replace('RoomLobby', { roomId });
          return;
        }
        if (result.code === 'ROOM_FULL') {
          setState('roomFull');
          setDetail(result.message);
          return;
        }
        if (result.code === 'ROOM_ENDED') {
          setState('roomEnded');
          setDetail(result.message);
          return;
        }
        if (result.code === 'INVITE_EXPIRED') {
          setState('invalidInvite');
          setDetail(result.message);
          return;
        }
        setState('error');
        setDetail(`${result.code}: ${result.message}`);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState('error');
        setDetail(error instanceof Error ? error.message : String(error));
      }
    }

    joinInvite().catch((error) => {
      if (!cancelled) {
        setState('error');
        setDetail(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation, roomId, token]);

  const copy = useMemo(() => {
    switch (state) {
      case 'loading':
        return {
          title: translateWithFallback(t, 'joinInvite.loadingTitle', '處理邀請中'),
          body: translateWithFallback(t, 'joinInvite.loadingBody', '正在檢查邀請資料。'),
        };
      case 'missingParams':
        return {
          title: translateWithFallback(t, 'joinInvite.missingTitle', '邀請連結不完整'),
          body: translateWithFallback(t, 'joinInvite.missingBody', '此邀請連結缺少必要資料，請房主重新分享。'),
        };
      case 'invalidInvite':
        return {
          title: translateWithFallback(t, 'joinInvite.invalidTitle', '邀請已失效'),
          body: translateWithFallback(t, 'joinInvite.invalidBody', '此邀請可能已過期或驗證資料不正確，請房主重新分享。'),
        };
      case 'roomFull':
        return {
          title: translateWithFallback(t, 'joinInvite.roomFullTitle', '房間已滿'),
          body: translateWithFallback(t, 'joinInvite.roomFullBody', '此房間已達人數上限。'),
        };
      case 'roomEnded':
        return {
          title: translateWithFallback(t, 'joinInvite.roomEndedTitle', '房間已結束'),
          body: translateWithFallback(t, 'joinInvite.roomEndedBody', '此房間已完場或封存，不能再加入。'),
        };
      case 'error':
      default:
        return {
          title: translateWithFallback(t, 'joinInvite.errorTitle', '加入房間失敗'),
          body: translateWithFallback(t, 'joinInvite.errorBody', '處理邀請時發生錯誤，請稍後再試。'),
        };
    }
  }, [state, t]);

  return (
    <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
      <View style={styles.content}>
        <Card style={styles.card}>
          <AppText style={styles.kicker}>{translateWithFallback(t, 'joinInvite.kicker', '房間邀請')}</AppText>
          <AppText style={styles.title}>{copy.title}</AppText>
          <AppText style={styles.body}>{copy.body}</AppText>
          {detail ? <AppText style={styles.detail}>{detail}</AppText> : null}
          <View style={styles.actions}>
            <AppButton
              label={translateWithFallback(t, 'common.back', '返回')}
              onPress={() => navigation.navigate('Home')}
              variant="secondary"
            />
          </View>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    gap: theme.spacing.sm,
  },
  kicker: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  title: {
    ...typography.title,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  detail: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  actions: {
    marginTop: theme.spacing.md,
  },
});

export default JoinInviteScreen;
