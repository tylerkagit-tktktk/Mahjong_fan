import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import PillGroup from '../components/PillGroup';
import TextField from '../components/TextField';
import ScreenContainer from '../components/ScreenContainer';
import { endGame, getGameBundle, insertHand, updateGameSeatRotationOffset } from '../db/repo';
import { computeHkSettlement, toAmountFromQ } from '../domain/hk/settlement';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { GameBundle } from '../models/db';
import {
  getDealerSeatIndexForNextHand,
  getNextDealerSeatIndex,
  getRoundLabel,
} from '../models/dealer';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';
import {
  normalizeSeatRotationOffset,
} from '../models/seatRotation';
import {
  CurrencyCode,
  getCurrencyMeta,
  inferCurrencyCodeFromSymbol,
  resolveCurrencyCode,
} from '../models/currency';
import ReseatFlow from './gameTable/ReseatFlow';
import { buildPlayersBySeat, formatSeatLabel } from './gameTable/seatMapping';
import {
  buildWrapToken,
  isWrapEvent,
  loadPersistedWrapToken,
  persistWrapToken,
  shouldPromptReseat,
} from './gameTable/wrap';
import { parseRules, RulesV1, Variant } from '../models/rules';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'GameTable'>;
type SettlementType = 'discard' | 'zimo';
type DrawDealerAction = 'stick' | 'pass';
type PaytableRow = {
  fan: number;
  discardTotal: number;
  zimoTotal: number;
};
type PaytableMeta = {
  minFan: number;
  maxFan: number;
  stakeLabel: string;
  gunModeLabel: string;
};

type PaytableBuildResult = {
  rows: PaytableRow[];
  meta: PaytableMeta;
};

type RuleSummaryMeta = {
  scoringLabel: string;
  gunLabel: string;
  stakeLabel: string;
  isHkTraditional: boolean;
};

type PlayerPanelProps = {
  seatIndex: number;
  name: string;
  seatWind: string;
  amount: number;
  isDealer: boolean;
  onPress: () => void;
  disabled?: boolean;
  currencyCode: CurrencyCode;
  style?: StyleProp<ViewStyle>;
};

const GRID = {
  x0_5: 4,
  x0_75: 6,
  x1: 8,
  x1_5: 12,
  x2: 16,
  x3: 24,
} as const;

const WIND_HONOR_GLYPHS: Array<'東' | '南' | '西' | '北'> = ['東', '南', '西', '北'];
const WIND_COLOR = {
  east: '#1A73E8',
  south: '#D93025',
  west: '#188038',
  north: '#5F6368',
} as const;
const WIND_HONOR_COLORS = [WIND_COLOR.east, WIND_COLOR.south, WIND_COLOR.west, WIND_COLOR.north] as const;

function GameTableScreen({ route, navigation }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [rules, setRules] = useState<RulesV1 | null>(null);
  const [totalsQ, setTotalsQ] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [dealerSeatIndex, setDealerSeatIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [winnerSeatIndex, setWinnerSeatIndex] = useState<number | null>(null);
  const [discarderSeatIndex, setDiscarderSeatIndex] = useState<number | null>(null);
  const [fanInput, setFanInput] = useState('');
  const [settlementType, setSettlementType] = useState<SettlementType>('discard');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const endingGameRef = useRef(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [tableLayout, setTableLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [showStakePaytable, setShowStakePaytable] = useState(false);
  const [paytableRows, setPaytableRows] = useState<PaytableRow[]>([]);
  const [paytableMeta, setPaytableMeta] = useState<PaytableMeta | null>(null);
  const [reseatVisible, setReseatVisible] = useState(false);
  const lastPromptedWrapTokenRef = useRef<string | null>(null);
  const wrapTokenLoadedRef = useRef(false);
  const wrapTokenLoadPromiseRef = useRef<Promise<void> | null>(null);

  const seatLabels = useMemo<string[]>(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );

  const currencyCode = useMemo<CurrencyCode>(() => {
    if (!rules) {
      return resolveCurrencyCode(inferCurrencyCodeFromSymbol(bundle?.game.currencySymbol));
    }
    return resolveCurrencyCode(rules.currencyCode, inferCurrencyCodeFromSymbol(rules.currencySymbol));
  }, [bundle?.game.currencySymbol, rules]);

  const sortedPlayers = useMemo(() => {
    const bySeat = buildPlayersBySeat(bundle);
    return [0, 1, 2, 3]
      .map((seat) => bySeat[seat])
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
  }, [bundle]);

  const playersBySeat = useMemo(() => {
    return buildPlayersBySeat(bundle) as Record<number, (typeof sortedPlayers)[number] | undefined>;
  }, [bundle]);

  const discarderOptions = useMemo(
    () =>
      sortedPlayers
        .filter((player) => player.seatIndex !== winnerSeatIndex)
        .map((player) => ({
          key: String(player.seatIndex),
          label: `${formatSeatLabel(t, player.seatIndex, player.seatIndex === dealerSeatIndex)} ${player.name}`,
        })),
    [dealerSeatIndex, sortedPlayers, t, winnerSeatIndex],
  );

  const ensureWrapTokenLoaded = useCallback(async () => {
    if (wrapTokenLoadedRef.current) {
      return;
    }
    if (wrapTokenLoadPromiseRef.current) {
      await wrapTokenLoadPromiseRef.current;
      return;
    }
    wrapTokenLoadPromiseRef.current = (async () => {
      try {
        const stored = await loadPersistedWrapToken(gameId);
        lastPromptedWrapTokenRef.current = stored;
      } catch {
        lastPromptedWrapTokenRef.current = null;
      } finally {
        wrapTokenLoadedRef.current = true;
      }
    })();
    await wrapTokenLoadPromiseRef.current;
  }, [gameId]);

  useEffect(() => {
    wrapTokenLoadedRef.current = false;
    wrapTokenLoadPromiseRef.current = null;
    lastPromptedWrapTokenRef.current = null;
    ensureWrapTokenLoaded().catch(() => {});
  }, [ensureWrapTokenLoaded]);

  const maybePromptReseat = useCallback(
    async (previousRoundLabelZh: string, nextRoundLabelZh: string, wrapToken: string) => {
      if (!isWrapEvent(previousRoundLabelZh, nextRoundLabelZh)) {
        return;
      }
      await ensureWrapTokenLoaded();
      if (!shouldPromptReseat(lastPromptedWrapTokenRef.current, wrapToken)) {
        return;
      }
      lastPromptedWrapTokenRef.current = wrapToken;
      try {
        await persistWrapToken(gameId, wrapToken);
      } catch {
        // best effort
      }
      setReseatVisible(true);
    },
    [ensureWrapTokenLoaded, gameId],
  );

  const handleApplyReseat = useCallback(
    async ({ rotationDelta }: { rotationDelta: number }) => {
      if (!bundle) {
        return;
      }
      const currentOffset = normalizeSeatRotationOffset(bundle.game.seatRotationOffset ?? 0);
      const nextOffset = normalizeSeatRotationOffset(currentOffset + rotationDelta);
      await updateGameSeatRotationOffset(bundle.game.id, nextOffset);
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              game: {
                ...prev.game,
                seatRotationOffset: nextOffset,
              },
            }
          : prev,
      );
    },
    [bundle],
  );

  const playerPanels = useMemo(() => [2, 1, 0, 3], []);

  const gameName = bundle?.game.title ?? '';
  const gameTitle = gameName || t('nav.dashboard');
  const isEnded = Boolean(bundle?.game.endedAt);
  const tableSize = Math.min(width * 0.56, 260);
  const tableVerticalOffset = Math.min(height * 0.06, 50);
  const panelWidth = Math.min(width * 0.28, 140);
  const panelHeight = 96;
  const EDGE_ANCHOR_T = 0.75;

  const seatOffset = useMemo(
    () => ({
      0: { dx: 4, dy: 7 }, // 東
      1: { dx: 4, dy: -7 }, // 南
      2: { dx: -4, dy: -7 }, // 西
      3: { dx: -4, dy: 7 }, // 北
    }),
    [],
  );

  const onTableLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    setTableLayout({ x, y, width: layoutWidth, height: layoutHeight });
  }, []);

  const panelStyleBySeat = useMemo(() => {
    if (!tableLayout) {
      return null;
    }

    const { x, y, width: tableWidth, height: tableHeight } = tableLayout;
    const center = { x: x + tableWidth / 2, y: y + tableHeight / 2 };
    const cornerTopLeft = { x, y };
    const cornerTopRight = { x: x + tableWidth, y };
    const cornerBottomRight = { x: x + tableWidth, y: y + tableHeight };
    const cornerBottomLeft = { x, y: y + tableHeight };

    const lerpPoint = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      ratio: number,
    ): { x: number; y: number } => ({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    });

    // Use center->corner lerp so panels sit near each diamond side midpoint (outside-ish), not on corners.
    const anchorTop = lerpPoint(center, cornerTopLeft, EDGE_ANCHOR_T); // 西
    const anchorRight = lerpPoint(center, cornerTopRight, EDGE_ANCHOR_T); // 南
    const anchorBottom = lerpPoint(center, cornerBottomRight, EDGE_ANCHOR_T); // 東
    const anchorLeft = lerpPoint(center, cornerBottomLeft, EDGE_ANCHOR_T); // 北

    const makePanelStyleFromAnchor = (
      anchor: { x: number; y: number },
      cardWidth: number,
      cardHeight: number,
      dx: number,
      dy: number,
    ) => ({
      position: 'absolute' as const,
      left: anchor.x + dx - cardWidth / 2,
      top: anchor.y + dy - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
    });

    return {
      0: makePanelStyleFromAnchor(
        anchorBottom,
        panelWidth,
        panelHeight,
        seatOffset[0].dx,
        seatOffset[0].dy,
      ),
      1: makePanelStyleFromAnchor(
        anchorRight,
        panelWidth,
        panelHeight,
        seatOffset[1].dx,
        seatOffset[1].dy,
      ),
      2: makePanelStyleFromAnchor(
        anchorTop,
        panelWidth,
        panelHeight,
        seatOffset[2].dx,
        seatOffset[2].dy,
      ),
      3: makePanelStyleFromAnchor(
        anchorLeft,
        panelWidth,
        panelHeight,
        seatOffset[3].dx,
        seatOffset[3].dy,
      ),
    } as Record<number, StyleProp<ViewStyle>>;
  }, [
    EDGE_ANCHOR_T,
    panelHeight,
    panelWidth,
    seatOffset,
    tableLayout,
  ]);

  const roundState = useMemo(() => {
    if (!bundle) {
      return null;
    }
    return getRoundLabel(bundle.game.startingDealerSeatIndex ?? 0, bundle.hands);
  }, [bundle]);
  const roundLabel = roundState?.labelZh ?? null;
  const roundIndex = roundState?.roundIndex ?? 1;
  const handCount = bundle?.hands.length ?? 0;
  const handCountLabel =
    handCount > 0
      ? t('gameTable.handCount.started').replace('{count}', String(handCount))
      : t('gameTable.handCount.notStarted');

  const rulesSummaryMeta = useMemo<RuleSummaryMeta | null>(() => {
    if (!rules || rules.mode !== 'HK' || !rules.hk) {
      return null;
    }

    const isHkTraditional = rules.hk.scoringPreset === 'traditionalFan';
    const scoringLabel = isHkTraditional ? t('newGame.hkPreset.traditional') : t('newGame.hkPreset.custom');
    const gunLabel = rules.hk.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full');
    const stakeLabelMap = {
      TWO_FIVE_CHICKEN: t('newGame.hkStakePreset.twoFiveChicken'),
      FIVE_ONE: t('newGame.hkStakePreset.fiveOne'),
      ONE_TWO: t('newGame.hkStakePreset.oneTwo'),
    } as const;
    const stakeLabel = stakeLabelMap[rules.hk.stakePreset] ?? rules.hk.stakePreset;
    return { scoringLabel, gunLabel, stakeLabel, isHkTraditional };
  }, [rules, t]);

  const rulesSummaryTags = useMemo(() => {
    if (!rulesSummaryMeta) {
      return null;
    }
    return [t('newGame.mode.hk'), rulesSummaryMeta.scoringLabel, rulesSummaryMeta.gunLabel, rulesSummaryMeta.stakeLabel];
  }, [rulesSummaryMeta, t]);

  const rulesSummaryStats = useMemo(() => {
    if (!rules || rules.mode !== 'HK' || !rules.hk) {
      return null;
    }

    const capText =
      rules.hk.capFan === null
        ? t('gameTable.rules.capNone')
        : t('gameTable.rules.capValue').replace('{count}', String(rules.hk.capFan));
    const minFanText =
      rules.minFanToWin === 0
        ? t('gameTable.rules.minNone')
        : t('gameTable.rules.minValue').replace('{count}', String(rules.minFanToWin));

    return {
      capText,
      minFanText,
    };
  }, [rules, t]);

  const elapsedLabel = useMemo(() => {
    if (!bundle?.game.createdAt) {
      return null;
    }
    const elapsedMs = Math.max(0, elapsedNow - bundle.game.createdAt);
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes < 60) {
      return t('gameTable.elapsed.minutes').replace('{minutes}', String(minutes));
    }
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (remain === 0) {
      return t('gameTable.elapsed.hours').replace('{hours}', String(hours));
    }
    return t('gameTable.elapsed.hoursMinutes')
      .replace('{hours}', String(hours))
      .replace('{minutes}', String(remain));
  }, [bundle?.game.createdAt, elapsedNow, t]);

  const footerLabel = useMemo(() => {
    if (!elapsedLabel) {
      return null;
    }
    if (gameName) {
      return `${gameName} · ${elapsedLabel}`;
    }
    return elapsedLabel;
  }, [elapsedLabel, gameName]);

  const buildTraditionalPaytableRows = useCallback((targetRules: RulesV1): PaytableBuildResult => {
    if (targetRules.mode !== 'HK' || targetRules.hk?.scoringPreset !== 'traditionalFan') {
      return {
        rows: [],
        meta: {
          minFan: 0,
          maxFan: 0,
          stakeLabel: '',
          gunModeLabel: '',
        },
      };
    }

    const minFanToWin = targetRules.minFanToWin ?? 0;
    const startFan = Math.max(minFanToWin || 0, 1);
    const rawCapFan = targetRules.hk.capFan;
    const capFan = typeof rawCapFan === 'number' ? rawCapFan : 13;
    const endFan = Math.min(capFan, 13);
    const hasValidRange = startFan <= endFan;
    const minFan = hasValidRange ? startFan : 3;
    const maxFan = hasValidRange ? endFan : 10;
    const stakeLabelMap = {
      TWO_FIVE_CHICKEN: t('newGame.hkStakePreset.twoFiveChicken'),
      FIVE_ONE: t('newGame.hkStakePreset.fiveOne'),
      ONE_TWO: t('newGame.hkStakePreset.oneTwo'),
    } as const;
    const stakeLabel = stakeLabelMap[targetRules.hk.stakePreset] ?? targetRules.hk.stakePreset;
    const gunModeLabel = targetRules.hk.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full');
    const rows: PaytableRow[] = [];

    for (let fan = minFan; fan <= maxFan; fan += 1) {
      const zimo = computeHkSettlement({
        rules: targetRules,
        fan,
        settlementType: 'zimo',
        winnerSeatIndex: 1,
        discarderSeatIndex: null,
      });
      const zimoTotal = zimo.deltasQ[1] / 4;

      const discard = computeHkSettlement({
        rules: targetRules,
        fan,
        settlementType: 'discard',
        winnerSeatIndex: 1,
        discarderSeatIndex: 0,
      });
      const discardTotal = discard.deltasQ[1] / 4;

      rows.push({
        fan,
        discardTotal,
        zimoTotal,
      });
    }

    return {
      rows,
      meta: {
        minFan,
        maxFan,
        stakeLabel,
        gunModeLabel,
      },
    };
  }, [t]);

  const handleStakeChipPress = useCallback(() => {
    if (!rules || rules.mode !== 'HK' || !rules.hk || rules.hk.scoringPreset !== 'traditionalFan') {
      return;
    }
    const result = buildTraditionalPaytableRows(rules);
    if (!result.rows.length) {
      return;
    }
    setPaytableRows(result.rows);
    setPaytableMeta(result.meta);
    setShowStakePaytable(true);
  }, [buildTraditionalPaytableRows, rules]);

  const paytableRangeLabel = useMemo(() => {
    const minFan = paytableMeta?.minFan ?? (paytableRows.length ? paytableRows[0].fan : null);
    const maxFan = paytableMeta?.maxFan ?? (paytableRows.length ? paytableRows[paytableRows.length - 1].fan : null);
    if (minFan === null || maxFan === null) {
      return t('gameTable.paytable.traditional');
    }
    const fanRangeLabel =
      minFan === maxFan
        ? t('gameTable.paytable.fanValue').replace('{fan}', String(minFan))
        : t('gameTable.paytable.fanRange').replace('{min}', String(minFan)).replace('{max}', String(maxFan));
    return t('gameTable.paytable.range').replace('{range}', fanRangeLabel);
  }, [paytableMeta, paytableRows, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: gameTitle,
    });
  }, [gameTitle, navigation]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedNow(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadTable = useCallback(async () => {
    const nextBundle = await getGameBundle(gameId);
    const parsedRules = parseRules(nextBundle.game.rulesJson, normalizeVariant(nextBundle.game.variant));
    const nextTotalsQ: [number, number, number, number] = [0, 0, 0, 0];

    for (const hand of nextBundle.hands) {
      const deltas = parseDeltasQ(hand.deltasJson);
      if (!deltas) {
        continue;
      }
      for (let seat = 0; seat < 4; seat += 1) {
        nextTotalsQ[seat] += deltas[seat];
      }
    }

    setBundle(nextBundle);
    setRules(parsedRules);
    setTotalsQ(nextTotalsQ);
    setDealerSeatIndex(
      getDealerSeatIndexForNextHand(nextBundle.game.startingDealerSeatIndex ?? 0, nextBundle.hands),
    );
  }, [gameId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await loadTable();
        } catch (err) {
          if (cancelled) {
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          setError(message || t('errors.loadGame'));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadTable, t]),
  );

  const openRecordModal = (seatIndex: number) => {
    if (saving || isEnded) {
      return;
    }
    setError(null);
    setWinnerSeatIndex(seatIndex);
    setDiscarderSeatIndex(null);
    setFanInput('');
    setSettlementType('discard');
    setModalVisible(true);
  };

  const closeRecordModal = () => {
    if (saving) {
      return;
    }
    setModalVisible(false);
  };

  const saveHand = async () => {
    if (!bundle || !rules || saving || isEnded) {
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (rules.mode !== 'HK') {
        setError(t('errors.addHand'));
        return;
      }

      const fan = Number(fanInput.trim());
      if (!Number.isInteger(fan) || fan < 1) {
        setError(t('errors.invalidFan'));
        return;
      }
      if (winnerSeatIndex === null) {
        setError(t('errors.selectWinner'));
        return;
      }
      if (settlementType === 'discard') {
        if (discarderSeatIndex === null) {
          setError(t('errors.selectDiscarder'));
          return;
        }
        if (winnerSeatIndex === discarderSeatIndex) {
          setError(t('errors.discarderCannotBeWinner'));
          return;
        }
      }

      const effectiveDiscarderSeatIndex = settlementType === 'discard' ? discarderSeatIndex : null;
      const settlement = computeHkSettlement({
        rules,
        fan,
        settlementType,
        winnerSeatIndex,
        discarderSeatIndex: effectiveDiscarderSeatIndex,
      });

      const winnerPlayer = playersBySeat[winnerSeatIndex] ?? null;
      const discarderPlayer =
        effectiveDiscarderSeatIndex === null
          ? null
          : playersBySeat[effectiveDiscarderSeatIndex] ?? null;

      if (!winnerPlayer || (settlementType === 'discard' && !discarderPlayer)) {
        setError(t('errors.addHand'));
        return;
      }

      const inserted = await insertHand({
        id: makeId('hand'),
        gameId: bundle.game.id,
        dealerSeatIndex,
        isDraw: false,
        winnerSeatIndex,
        discarderSeatIndex: effectiveDiscarderSeatIndex,
        type: 'fan',
        winnerPlayerId: winnerPlayer.id,
        discarderPlayerId: discarderPlayer?.id ?? null,
        inputValue: toAmountFromQ(settlement.totalWinAmountQ),
        deltasJson: JSON.stringify({ unit: 'Q', values: settlement.deltasQ }),
        computedJson: JSON.stringify({
          source: settlement.source,
          fan,
          effectiveFan: settlement.effectiveFan,
          settlementType,
          discarderPaysQ: settlement.discarderPaysQ,
          othersPayQ: settlement.othersPayQ,
          totalWinAmountQ: settlement.totalWinAmountQ,
        }),
      });

      const previousRoundLabelZh = bundle.game.currentRoundLabelZh ?? INITIAL_ROUND_LABEL_ZH;
      const nextRoundLabelZh = inserted.nextRoundLabelZh ?? previousRoundLabelZh;
      const wrapToken = buildWrapToken({
        gameId: bundle.game.id,
        handIndex: inserted.handIndex,
        nextRoundLabelZh,
      });

      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          game: {
            ...prev.game,
            currentRoundLabelZh: nextRoundLabelZh,
          },
          hands: [...prev.hands, inserted],
        };
      });
      setTotalsQ((prev) => [
        prev[0] + settlement.deltasQ[0],
        prev[1] + settlement.deltasQ[1],
        prev[2] + settlement.deltasQ[2],
        prev[3] + settlement.deltasQ[3],
      ]);
      setDealerSeatIndex((prev) =>
        getNextDealerSeatIndex({
          dealerSeatIndex: prev,
          isDraw: false,
          winnerSeatIndex,
        }),
      );
      setModalVisible(false);
      await maybePromptReseat(previousRoundLabelZh, nextRoundLabelZh, wrapToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('errors.addHand'));
    } finally {
      setSaving(false);
    }
  };

  const saveDrawHand = async (dealerAction: DrawDealerAction) => {
    if (!bundle || saving || isEnded) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const inserted = await insertHand({
        id: makeId('hand'),
        gameId: bundle.game.id,
        dealerSeatIndex,
        isDraw: true,
        winnerSeatIndex: null,
        discarderSeatIndex: null,
        type: 'draw',
        winnerPlayerId: null,
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
        computedJson: JSON.stringify({
          source: 'draw',
          settlementType: 'draw',
          dealerAction,
        }),
      });

      const previousRoundLabelZh = bundle.game.currentRoundLabelZh ?? INITIAL_ROUND_LABEL_ZH;
      const nextRoundLabelZh = inserted.nextRoundLabelZh ?? previousRoundLabelZh;
      const wrapToken = buildWrapToken({
        gameId: bundle.game.id,
        handIndex: inserted.handIndex,
        nextRoundLabelZh,
      });

      setBundle((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          game: {
            ...prev.game,
            currentRoundLabelZh: nextRoundLabelZh,
          },
          hands: [...prev.hands, inserted],
        };
      });

      setDealerSeatIndex((prev) => {
        if (dealerAction === 'stick') {
          return prev;
        }
        return (prev + 1) % 4;
      });
      await maybePromptReseat(previousRoundLabelZh, nextRoundLabelZh, wrapToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('errors.addHand'));
    } finally {
      setSaving(false);
    }
  };

  const handleEndGame = () => {
    if (!bundle || saving || endingGameRef.current || isEnded) {
      return;
    }

    Alert.alert(t('gameTable.endGame.title'), t('gameTable.endGame.message'), [
      { text: t('gameTable.endGame.cancel'), style: 'cancel' },
      {
        text: t('gameTable.endGame.confirm'),
        style: 'destructive',
        onPress: async () => {
          if (endingGameRef.current) {
            return;
          }
          try {
            endingGameRef.current = true;
            setEndingGame(true);
            const endedAt = Date.now();
            await endGame(bundle.game.id, endedAt);
            setBundle((prev) => {
              if (!prev) {
                return prev;
              }
              return {
                ...prev,
                game: {
                  ...prev.game,
                  endedAt,
                },
              };
            });
            navigation.replace('GameDashboard', { gameId: bundle.game.id });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message || t('gameTable.endGame.failed'));
          } finally {
            endingGameRef.current = false;
            setEndingGame(false);
          }
        },
      },
    ]);
  };

  const handleDrawActionPress = () => {
    if (!bundle || saving || endingGame || isEnded) {
      return;
    }
    Alert.alert(t('gameTable.draw.title'), t('gameTable.draw.message'), [
      { text: t('gameTable.draw.cancel'), style: 'cancel' },
      { text: t('gameTable.draw.stick'), onPress: () => { saveDrawHand('stick'); } },
      { text: t('gameTable.draw.pass'), onPress: () => { saveDrawHand('pass'); } },
    ]);
  };

  return (
    <ScreenContainer style={styles.tableScreen} includeTopInset={false} includeBottomInset={false} horizontalPadding={0}>
      <View style={styles.container}>
        <View style={styles.contentArea}>
          <View style={styles.headerInfoBlock}>
            {roundLabel ? <Text style={styles.roundLabel}>{roundLabel}</Text> : null}
            <Text style={styles.roundSummaryLine}>
              {roundLabel
                ? t('gameTable.roundSummary').replace('{round}', String(roundIndex)).replace('{status}', handCountLabel)
                : handCountLabel}
            </Text>
            <View style={styles.roundDivider} />
          </View>

          {rulesSummaryTags ? (
            <View style={styles.rulesSummaryCard}>
              <View style={styles.ruleTagsRow}>
                {rulesSummaryTags.map((tag, index) => {
                  const isStakeTag = index === rulesSummaryTags.length - 1;
                  if (isStakeTag) {
                    return (
                      <Pressable
                        key={tag}
                        style={[styles.ruleTag, styles.ruleTagInteractive]}
                        onPress={handleStakeChipPress}
                      >
                        <Text style={styles.ruleTagText}>{tag}</Text>
                        <Text style={styles.rulesChipInfo}>ⓘ</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <View key={tag} style={styles.ruleTag}>
                      <Text style={styles.ruleTagText}>{tag}</Text>
                    </View>
                  );
                })}
              </View>
              {rulesSummaryStats ? (
                <View style={styles.rulesStatsRow}>
                  <View style={styles.rulesStatBadge}>
                    <Text style={styles.rulesStatEmoji}>🧨</Text>
                    <Text style={styles.rulesStatValue}>{rulesSummaryStats.capText}</Text>
                  </View>
                  <View style={styles.rulesStatBadge}>
                    <Text style={styles.rulesStatValue}>{rulesSummaryStats.minFanText}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {isEnded ? <Text style={styles.readonlyText}>{t('gameTable.readonly')}</Text> : null}

          <View style={styles.tableZone}>
            <View
              style={[
                styles.tableWrap,
                { width: tableSize, height: tableSize, marginTop: tableVerticalOffset },
              ]}
            >
              <View style={[styles.tableOuter, { width: tableSize, height: tableSize }]} onLayout={onTableLayout}>
                <View style={styles.tableBoard} pointerEvents="none">
                  <View style={styles.tableBoardInset} />
                </View>
              </View>

              <View style={styles.centerBadge}>
                <View style={styles.centerDealerDot} />
                <Text style={styles.centerBadgeLabel}>{t('gameTable.currentDealer')}</Text>
                <Text
                  style={[
                    styles.centerBadgeValue,
                    {
                      color: WIND_HONOR_COLORS[dealerSeatIndex] ?? theme.colors.danger,
                    },
                  ]}
                >
                  {WIND_HONOR_GLYPHS[dealerSeatIndex] ?? seatLabels[dealerSeatIndex] ?? t('seat.east')}
                </Text>
              </View>

              {panelStyleBySeat
                ? playerPanels.map((seatIndex) => {
                    const player = playersBySeat[seatIndex];
                    return (
                      <PlayerPanel
                        key={`seat-${seatIndex}`}
                        seatIndex={seatIndex}
                        name={player?.name ?? '--'}
                        seatWind={seatLabels[seatIndex] ?? t('seat.east')}
                        amount={totalsQ[seatIndex] / 4}
                        isDealer={seatIndex === dealerSeatIndex}
                        onPress={() => openRecordModal(seatIndex)}
                        disabled={saving || isEnded}
                        currencyCode={currencyCode}
                        style={panelStyleBySeat[seatIndex]}
                      />
                    );
                  })
                : null}
            </View>
          </View>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        </View>

        <View style={[styles.footerArea, { paddingBottom: insets.bottom + GRID.x2 }]}>
          {footerLabel ? <Text style={styles.elapsedText}>{footerLabel}</Text> : null}

          <View style={styles.footerButtonsRow}>
            <AppButton
              label={t('gameTable.action.draw')}
              onPress={handleDrawActionPress}
              disabled={saving || !bundle || isEnded}
              variant="secondary"
              style={styles.footerButton}
            />
            <AppButton
              label={t('gameTable.action.endGame')}
              onPress={handleEndGame}
              disabled={saving || endingGame || isEnded}
              style={styles.footerButton}
            />
          </View>
        </View>
      </View>

      <Modal transparent animationType="fade" visible={modalVisible} onRequestClose={closeRecordModal}>
        <Pressable style={styles.modalOverlay} onPress={closeRecordModal}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('addHand.title')}</Text>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('addHand.winner')}</Text>
              <Text style={styles.readonlyWinnerText}>
                {winnerSeatIndex === null
                  ? '--'
                  : `${formatSeatLabel(
                      t,
                      winnerSeatIndex,
                      winnerSeatIndex === dealerSeatIndex,
                    )} ${playersBySeat[winnerSeatIndex]?.name ?? ''}`}
              </Text>
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('addHand.settlementType')}</Text>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeButton, settlementType === 'discard' ? styles.modeButtonActive : null]}
                  onPress={() => setSettlementType('discard')}
                  disabled={saving}
                >
                  <Text style={[styles.modeButtonText, settlementType === 'discard' ? styles.modeButtonTextActive : null]}>
                    {t('addHand.settlementType.discard')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeButton, settlementType === 'zimo' ? styles.modeButtonActive : null]}
                  onPress={() => {
                    setSettlementType('zimo');
                    setDiscarderSeatIndex(null);
                  }}
                  disabled={saving}
                >
                  <Text style={[styles.modeButtonText, settlementType === 'zimo' ? styles.modeButtonTextActive : null]}>
                    {t('addHand.settlementType.zimo')}
                  </Text>
                </Pressable>
              </View>
            </Card>

            {settlementType === 'discard' ? (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{t('addHand.discarder')}</Text>
                <PillGroup
                  options={discarderOptions}
                  valueKey={discarderSeatIndex === null ? null : String(discarderSeatIndex)}
                  onChange={(next) => setDiscarderSeatIndex(next === null ? null : Number(next))}
                  includeNoneOption={false}
                  disabled={saving}
                />
              </Card>
            ) : null}

            <Card style={styles.sectionCard}>
              <TextField
                label={t('addHand.inputFan')}
                value={fanInput}
                onChangeText={(value) => setFanInput(value.replace(/[^0-9]/g, ''))}
                placeholder="1"
              />
            </Card>

            {error ? <Text style={styles.modalErrorText}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton
                label={t('common.back')}
                onPress={closeRecordModal}
                disabled={saving}
                variant="secondary"
                style={styles.secondaryButton}
              />
              <AppButton
                label={saving ? t('newGame.creating') : t('addHand.save')}
                onPress={saveHand}
                disabled={saving}
                style={styles.primaryButton}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ReseatFlow
        visible={reseatVisible}
        currentRoundLabelZh={bundle?.game.currentRoundLabelZh ?? INITIAL_ROUND_LABEL_ZH}
        handsCount={bundle?.hands.length ?? 0}
        currentDealerSeatIndex={dealerSeatIndex}
        currentPlayersBySeat={[0, 1, 2, 3]
          .map((seat) => playersBySeat[seat])
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .map((entry) => ({ id: entry.id, name: entry.name }))}
        onDismiss={() => setReseatVisible(false)}
        onApplyReseat={handleApplyReseat}
      />

      <Modal
        visible={showStakePaytable}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStakePaytable(false)}
      >
        <Pressable style={styles.paytableBackdrop} onPress={() => setShowStakePaytable(false)}>
          <Pressable style={styles.paytableCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.paytableHeader}>
              <Text style={styles.paytableTitle}>
                {paytableMeta?.stakeLabel ?? rulesSummaryMeta?.stakeLabel ?? ''} · {paytableMeta?.gunModeLabel ?? (rules?.hk?.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full'))}
              </Text>
              <Text style={styles.paytableSubtitle}>{paytableRangeLabel}</Text>
              <Text style={styles.paytableCaption}>{t('gameTable.paytable.caption')}</Text>
            </View>

            <ScrollView style={styles.paytableScroll} horizontal>
              <View>
                <View style={styles.paytableRowHeader}>
                  <Text style={[styles.paytableCell, styles.paytableCellFan]}>{t('gameTable.paytable.col.fan')}</Text>
                  <Text style={styles.paytableCell}>{t('gameTable.paytable.col.discard')}</Text>
                  <Text style={styles.paytableCell}>{t('gameTable.paytable.col.zimo')}</Text>
                </View>

                {paytableRows.map((row) => (
                  <View key={row.fan} style={styles.paytableRow}>
                    <Text style={[styles.paytableCell, styles.paytableCellFan]}>
                      {t('gameTable.paytable.fanValue').replace('{fan}', String(row.fan))}
                    </Text>
                    <Text style={styles.paytableCell}>HK${formatMoneyValue(row.discardTotal)}</Text>
                    <Text style={styles.paytableCell}>HK${formatMoneyValue(row.zimoTotal)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <Pressable style={styles.paytableCloseButton} onPress={() => setShowStakePaytable(false)}>
              <Text style={styles.paytableCloseText}>{t('gameTable.paytable.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function PlayerPanel({
  seatIndex,
  name,
  seatWind,
  amount,
  isDealer,
  onPress,
  disabled,
  currencyCode,
  style,
}: PlayerPanelProps) {
  const { t } = useAppLanguage();
  const amountColor =
    amount > 0 ? '#188038' : amount < 0 ? '#C5221F' : theme.colors.textSecondary;
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const { symbol } = getCurrencyMeta(currencyCode);
  const absolute = Math.abs(amount);
  const windGlyph = WIND_HONOR_GLYPHS[seatIndex] ?? seatWind;
  const windColor = WIND_HONOR_COLORS[seatIndex] ?? theme.colors.textSecondary;

  return (
    <Pressable
      style={[styles.playerPanel, style, disabled ? styles.playerPanelDisabled : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.playerPanelCard}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.playerName}>
          {name}
        </Text>
        <View style={styles.playerMetaRow}>
          <Text style={[styles.playerSeat, { color: windColor }]}>{windGlyph}</Text>
          {isDealer ? <Text style={styles.dealerText}>{` · ${t('newGame.dealerBadge')}`}</Text> : null}
        </View>
        <Text style={[styles.playerAmount, { color: amountColor }]}>
          {`${sign}${symbol}${formatMoneyValue(absolute)}`}
        </Text>
      </View>
    </Pressable>
  );
}

function parseDeltasQ(deltasJson: string | null | undefined): [number, number, number, number] | null {
  if (!deltasJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(deltasJson) as unknown;
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((item) => Number.isFinite(item))) {
      return [
        Math.round(Number(parsed[0]) * 4),
        Math.round(Number(parsed[1]) * 4),
        Math.round(Number(parsed[2]) * 4),
        Math.round(Number(parsed[3]) * 4),
      ];
    }
    if (isRecord(parsed) && Array.isArray(parsed.values) && parsed.values.length === 4) {
      const values = parsed.values.map((item) => Number(item));
      if (!values.every((item) => Number.isFinite(item))) {
        return null;
      }
      if (parsed.unit === 'Q') {
        return [
          Math.round(values[0]),
          Math.round(values[1]),
          Math.round(values[2]),
          Math.round(values[3]),
        ];
      }
      return [
        Math.round(values[0] * 4),
        Math.round(values[1] * 4),
        Math.round(values[2] * 4),
        Math.round(values[3] * 4),
      ];
    }
    if (isRecord(parsed) && Array.isArray(parsed.deltasQ) && parsed.deltasQ.length === 4) {
      const values = parsed.deltasQ.map((item) => Number(item));
      if (!values.every((item) => Number.isFinite(item))) {
        return null;
      }
      return [
        Math.round(values[0]),
        Math.round(values[1]),
        Math.round(values[2]),
        Math.round(values[3]),
      ];
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeVariant(value: string): Variant {
  if (value === 'HK' || value === 'TW' || value === 'PMA') {
    return value;
  }
  if (value === 'TW_SIMPLE') {
    return 'TW';
  }
  return 'HK';
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoneyValue(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

const styles = StyleSheet.create({
  tableScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'space-between',
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: GRID.x2,
    paddingTop: GRID.x2,
  },
  headerInfoBlock: {
    marginTop: GRID.x1_5,
    marginBottom: GRID.x0_5,
  },
  roundLabel: {
    ...typography.title,
    textAlign: 'left',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 0,
  },
  roundSummaryLine: {
    ...typography.body,
    textAlign: 'left',
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: GRID.x0_5,
  },
  roundDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E4EA',
    opacity: 0.9,
    marginTop: GRID.x0_5,
    marginBottom: GRID.x0_5,
  },
  rulesSummaryCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: GRID.x0_5,
    marginBottom: GRID.x0_5,
  },
  ruleTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: GRID.x0_5,
  },
  ruleTag: {
    paddingHorizontal: GRID.x1_5,
    paddingVertical: GRID.x0_5,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E4EA',
    marginRight: 6,
    marginBottom: GRID.x0_5,
  },
  ruleTagInteractive: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleTagText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  rulesChipInfo: {
    marginLeft: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  rulesStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginTop: GRID.x0_5,
    gap: 6,
  },
  rulesStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: GRID.x0_5,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E4EA',
    marginRight: 0,
    marginBottom: GRID.x0_5,
  },
  rulesStatEmoji: {
    marginRight: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  rulesStatValue: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: theme.colors.textPrimary,
  },
  readonlyText: {
    ...typography.body,
    textAlign: 'center',
    color: theme.colors.danger,
    marginBottom: GRID.x1,
  },
  tableWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: GRID.x2,
    paddingBottom: GRID.x1,
  },
  tableOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBoard: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: '#c49a6c',
    borderWidth: 1,
    borderColor: '#9d7448',
    shadowColor: '#7f5a36',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  tableBoardInset: {
    position: 'absolute',
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(89, 56, 30, 0.12)',
  },
  centerBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 106,
    height: 106,
    marginLeft: -53,
    marginTop: -53,
    borderRadius: 53,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDealerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.danger,
    marginTop: 1,
    marginBottom: 6,
  },
  centerBadgeLabel: {
    ...typography.body,
    color: theme.colors.textSecondary,
    opacity: 0.8,
    fontWeight: '500',
    marginBottom: 2,
  },
  centerBadgeValue: {
    fontSize: Math.round(theme.fontSize.xl * 1.15),
    fontWeight: '700',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0, 0, 0, 0.08)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    lineHeight: 40,
  },
  playerPanel: {
    position: 'absolute',
    alignItems: 'center',
  },
  playerPanelDisabled: {
    opacity: 0.7,
  },
  playerPanelCard: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  playerName: {
    ...typography.subtitle,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playerSeat: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  dealerText: {
    ...typography.body,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  playerAmount: {
    ...typography.body,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
  },
  errorBanner: {
    ...typography.body,
    marginTop: GRID.x1,
    marginBottom: GRID.x1,
    paddingHorizontal: GRID.x1,
    color: theme.colors.danger,
    textAlign: 'center',
  },
  footerArea: {
    paddingHorizontal: GRID.x3,
    paddingTop: GRID.x1,
    backgroundColor: theme.colors.background,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: GRID.x2,
    marginTop: GRID.x1,
  },
  footerButton: {
    flex: 1,
  },
  elapsedText: {
    ...typography.caption,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    opacity: 0.9,
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    paddingHorizontal: GRID.x2,
  },
  modalCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: GRID.x2,
    maxHeight: '82%',
  },
  modalTitle: {
    ...typography.title,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1_5,
  },
  sectionCard: {
    marginBottom: GRID.x1_5,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1,
  },
  readonlyWinnerText: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    gap: GRID.x1,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: GRID.x1,
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(58,136,132,0.16)',
  },
  modeButtonText: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  modalErrorText: {
    ...typography.body,
    marginTop: GRID.x1,
    marginBottom: GRID.x1,
    color: theme.colors.danger,
  },
  modalActions: {
    marginTop: GRID.x1_5,
    flexDirection: 'row',
  },
  secondaryButton: {
    flex: 1,
    marginRight: GRID.x1,
  },
  primaryButton: {
    flex: 1,
    marginLeft: GRID.x1,
  },
  paytableBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: GRID.x2,
  },
  paytableCard: {
    width: '88%',
    maxHeight: '70%',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: GRID.x2,
    paddingTop: GRID.x2,
    paddingBottom: GRID.x1_5,
  },
  paytableHeader: {
    marginBottom: GRID.x1,
  },
  paytableTitle: {
    ...typography.subtitle,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  paytableSubtitle: {
    ...typography.caption,
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  paytableCaption: {
    ...typography.caption,
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  paytableScroll: {
    marginTop: GRID.x1,
    marginBottom: GRID.x1,
  },
  paytableRowHeader: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E4EA',
    paddingBottom: 4,
    marginBottom: 4,
  },
  paytableRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  paytableCell: {
    ...typography.caption,
    width: 128,
    fontSize: 11,
    color: theme.colors.textPrimary,
  },
  paytableCellFan: {
    width: 72,
    fontWeight: '500',
  },
  paytableCloseButton: {
    alignSelf: 'center',
    marginTop: GRID.x0_5,
    paddingHorizontal: GRID.x2,
    paddingVertical: GRID.x0_75,
    borderRadius: 999,
    backgroundColor: '#EEF3F8',
  },
  paytableCloseText: {
    ...typography.caption,
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500',
  },
});

export default GameTableScreen;
