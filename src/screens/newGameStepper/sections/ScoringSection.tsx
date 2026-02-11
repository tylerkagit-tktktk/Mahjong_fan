import { Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import StepperNumberInput from '../../../components/StepperNumberInput';
import { HkGunMode, HkScoringPreset, HkStakePreset, Variant } from '../../../models/rules';
import theme from '../../../theme/theme';
import { CAP_FAN_MAX, CAP_FAN_MIN, GRID, MIN_FAN_MAX, MIN_FAN_MIN, SAMPLE_FAN_MAX, SAMPLE_FAN_MIN, UNIT_PER_FAN_MAX, UNIT_PER_FAN_MIN } from '../constants';
import { CapMode } from '../types';

type Props = {
  mode: Variant;
  hkScoringPreset: HkScoringPreset;
  hkGunMode: HkGunMode;
  hkStakePreset: HkStakePreset;
  capFan: 8 | 10 | 13;
  customCapMode: CapMode;
  customCapFanInput: string;
  minFanInput: string;
  unitPerFanInput: string;
  sampleFan: number;
  minFanError: string | null;
  unitPerFanError: string | null;
  customCapFanError: string | null;
  currencySymbol: string;
  sampleBaseAmount: number | null;
  sampleEffectiveFan: number;
  sampleHalfZimoEach: number | null;
  sampleHalfDiscarder: number | null;
  sampleHalfOthersEach: number | null;
  sampleFullZimoEach: number | null;
  sampleFullDiscarder: number | null;
  disabled: boolean;
  minFanInputRef: Ref<TextInput>;
  unitPerFanInputRef: Ref<TextInput>;
  customCapFanInputRef: Ref<TextInput>;
  labels: {
    title: string;
    hkPresetTraditional: string;
    hkPresetCustom: string;
    hkGunModeLabel: string;
    hkGunModeHalf: string;
    hkGunModeFull: string;
    hkStakePresetLabel: string;
    hkStakePresetTwoFive: string;
    hkStakePresetFiveOne: string;
    hkStakePresetOneTwo: string;
    minFanThresholdLabel: string;
    hkThresholdHelp: string;
    unitPerFanLabel: string;
    unitPerFanHelp: string;
    capModeLabel: string;
    capModeEight: string;
    capModeTen: string;
    capModeThirteen: string;
    capFanLabel: string;
    capFanHelp: string;
    customCapModeLabel: string;
    customCapModeNone: string;
    customCapModeFanCap: string;
    customCapFanLabel: string;
    customCapNoneHelp: string;
    customCapValueHelp: string;
    sampleFanLabel: string;
    realtimeEffectiveFan: string;
    realtimeHalfGun: string;
    realtimeFullGun: string;
    twThresholdHelp: string;
    pmaDescription: string;
  };
  stakePresetHintLines: string[];
  onHkScoringPresetChange: (value: HkScoringPreset) => void;
  onHkGunModeChange: (value: HkGunMode) => void;
  onHkStakePresetChange: (value: HkStakePreset) => void;
  onCapFanChange: (value: 8 | 10 | 13) => void;
  onCustomCapModeChange: (value: CapMode) => void;
  onCustomCapFanInputChange: (value: string) => void;
  onCustomCapFanBlur: () => void;
  onCustomCapFanIncrement: () => void;
  onCustomCapFanDecrement: () => void;
  onMinFanInputChange: (value: string) => void;
  onMinFanBlur: () => void;
  onMinFanIncrement: () => void;
  onMinFanDecrement: () => void;
  onUnitPerFanInputChange: (value: string) => void;
  onUnitPerFanBlur: () => void;
  onUnitPerFanIncrement: () => void;
  onUnitPerFanDecrement: () => void;
  onSampleFanInputChange: (value: string) => void;
  onSampleFanIncrement: () => void;
  onSampleFanDecrement: () => void;
};

function ScoringSection({
  mode,
  hkScoringPreset,
  hkGunMode,
  hkStakePreset,
  capFan,
  customCapMode,
  customCapFanInput,
  minFanInput,
  unitPerFanInput,
  sampleFan,
  minFanError,
  unitPerFanError,
  customCapFanError,
  currencySymbol,
  sampleBaseAmount,
  sampleEffectiveFan,
  sampleHalfZimoEach,
  sampleHalfDiscarder,
  sampleHalfOthersEach,
  sampleFullZimoEach,
  sampleFullDiscarder,
  disabled,
  minFanInputRef,
  unitPerFanInputRef,
  customCapFanInputRef,
  labels,
  stakePresetHintLines,
  onHkScoringPresetChange,
  onHkGunModeChange,
  onHkStakePresetChange,
  onCapFanChange,
  onCustomCapModeChange,
  onCustomCapFanInputChange,
  onCustomCapFanBlur,
  onCustomCapFanIncrement,
  onCustomCapFanDecrement,
  onMinFanInputChange,
  onMinFanBlur,
  onMinFanIncrement,
  onMinFanDecrement,
  onUnitPerFanInputChange,
  onUnitPerFanBlur,
  onUnitPerFanIncrement,
  onUnitPerFanDecrement,
  onSampleFanInputChange,
  onSampleFanIncrement,
  onSampleFanDecrement,
}: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{labels.title}</Text>

      {mode === 'HK' ? (
        <>
          <SegmentedControl<HkScoringPreset>
            options={[
              { value: 'traditionalFan', label: labels.hkPresetTraditional },
              { value: 'customTable', label: labels.hkPresetCustom },
            ]}
            value={hkScoringPreset}
            onChange={onHkScoringPresetChange}
            disabled={disabled}
          />

          {hkScoringPreset === 'traditionalFan' ? (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.hkGunModeLabel}</Text>
              <SegmentedControl<HkGunMode>
                options={[
                  { value: 'halfGun', label: labels.hkGunModeHalf },
                  { value: 'fullGun', label: labels.hkGunModeFull },
                ]}
                value={hkGunMode}
                onChange={onHkGunModeChange}
                disabled={disabled}
              />

              <View style={styles.blockSpacing}>
                <Text style={styles.inputLabel}>{labels.hkStakePresetLabel}</Text>
                <SegmentedControl<HkStakePreset>
                  options={[
                    { value: 'TWO_FIVE_CHICKEN', label: labels.hkStakePresetTwoFive },
                    { value: 'FIVE_ONE', label: labels.hkStakePresetFiveOne },
                    { value: 'ONE_TWO', label: labels.hkStakePresetOneTwo },
                  ]}
                  value={hkStakePreset}
                  onChange={onHkStakePresetChange}
                  disabled={disabled}
                />
                {stakePresetHintLines.map((line, index) => (
                  <Text key={`${hkStakePreset}-${hkGunMode}-${index}`} style={index === 0 ? styles.helperText : styles.helperTextSubLine}>
                    {line}
                  </Text>
                ))}
              </View>

              <View style={styles.blockSpacing}>
                <Text style={styles.inputLabel}>{labels.minFanThresholdLabel}</Text>
                <StepperNumberInput
                  inputRef={minFanInputRef}
                  valueText={minFanInput}
                  onChangeText={onMinFanInputChange}
                  onBlur={onMinFanBlur}
                  onIncrement={onMinFanIncrement}
                  onDecrement={onMinFanDecrement}
                  placeholder={`${MIN_FAN_MIN}-${MIN_FAN_MAX}`}
                  editable={!disabled}
                  hasError={Boolean(minFanError)}
                />
              </View>

              <Text style={styles.helperText}>{labels.hkThresholdHelp}</Text>
              {minFanError ? <Text style={styles.inlineErrorText}>{minFanError}</Text> : null}
            </View>
          ) : (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.hkGunModeLabel}</Text>
              <SegmentedControl<HkGunMode>
                options={[
                  { value: 'halfGun', label: labels.hkGunModeHalf },
                  { value: 'fullGun', label: labels.hkGunModeFull },
                ]}
                value={hkGunMode}
                onChange={onHkGunModeChange}
                disabled={disabled}
              />

              <View style={styles.blockSpacing}>
                <Text style={styles.inputLabel}>{labels.unitPerFanLabel}</Text>
                <StepperNumberInput
                  inputRef={unitPerFanInputRef}
                  valueText={unitPerFanInput}
                  onChangeText={onUnitPerFanInputChange}
                  onBlur={onUnitPerFanBlur}
                  onIncrement={onUnitPerFanIncrement}
                  onDecrement={onUnitPerFanDecrement}
                  placeholder={`${UNIT_PER_FAN_MIN}-${UNIT_PER_FAN_MAX}`}
                  editable={!disabled}
                  hasError={Boolean(unitPerFanError)}
                />
                <Text style={styles.helperText}>{labels.unitPerFanHelp}</Text>
                {unitPerFanError ? <Text style={styles.inlineErrorText}>{unitPerFanError}</Text> : null}
              </View>
            </View>
          )}

          {hkScoringPreset === 'traditionalFan' ? (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.capModeLabel}</Text>
              <SegmentedControl<8 | 10 | 13>
                options={[
                  { value: 8, label: labels.capModeEight },
                  { value: 10, label: labels.capModeTen },
                  { value: 13, label: labels.capModeThirteen },
                ]}
                value={capFan}
                onChange={onCapFanChange}
                disabled={disabled}
              />
            </View>
          ) : (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.customCapModeLabel}</Text>
              <SegmentedControl<CapMode>
                options={[
                  { value: 'none', label: labels.customCapModeNone },
                  { value: 'fanCap', label: labels.customCapModeFanCap },
                ]}
                value={customCapMode}
                onChange={onCustomCapModeChange}
                disabled={disabled}
              />

              {customCapMode === 'fanCap' ? (
                <>
                  <View style={styles.blockSpacing}>
                    <Text style={styles.inputLabel}>{labels.customCapFanLabel}</Text>
                    <StepperNumberInput
                      inputRef={customCapFanInputRef}
                      valueText={customCapFanInput}
                      onChangeText={onCustomCapFanInputChange}
                      onBlur={onCustomCapFanBlur}
                      onIncrement={onCustomCapFanIncrement}
                      onDecrement={onCustomCapFanDecrement}
                      placeholder={`${CAP_FAN_MIN}-${CAP_FAN_MAX}`}
                      editable={!disabled}
                      hasError={Boolean(customCapFanError)}
                    />
                    {customCapFanError ? <Text style={styles.inlineErrorText}>{customCapFanError}</Text> : null}
                  </View>
                  <Text style={styles.helperText}>{labels.customCapValueHelp.replaceAll('{capFan}', customCapFanInput || '0')}</Text>
                </>
              ) : (
                <Text style={styles.helperText}>{labels.customCapNoneHelp}</Text>
              )}
            </View>
          )}

          {hkScoringPreset === 'customTable' ? (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.sampleFanLabel}</Text>
              <StepperNumberInput
                valueText={String(sampleFan)}
                onChangeText={onSampleFanInputChange}
                onIncrement={onSampleFanIncrement}
                onDecrement={onSampleFanDecrement}
                placeholder={`${SAMPLE_FAN_MIN}-${SAMPLE_FAN_MAX}`}
                editable={!disabled}
              />
              {sampleBaseAmount !== null ? (
                <>
                  <Text style={styles.helperText}>{`${labels.realtimeEffectiveFan} = ${sampleEffectiveFan}`}</Text>
                  <Text style={styles.helperTextSubLine}>
                    {labels.realtimeHalfGun
                      .replaceAll('{zimoEach}', `${currencySymbol}${String(sampleHalfZimoEach ?? 0)}`)
                      .replaceAll('{discarder}', `${currencySymbol}${String(sampleHalfDiscarder ?? 0)}`)
                      .replaceAll('{othersEach}', `${currencySymbol}${String(sampleHalfOthersEach ?? 0)}`)}
                  </Text>
                  <Text style={styles.helperTextSubLine}>
                    {labels.realtimeFullGun
                      .replaceAll('{zimoEach}', `${currencySymbol}${String(sampleFullZimoEach ?? 0)}`)
                      .replaceAll('{discarder}', `${currencySymbol}${String(sampleFullDiscarder ?? 0)}`)}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {mode === 'TW' ? (
        <View style={styles.blockSpacing}>
          <Text style={styles.inputLabel}>{labels.minFanThresholdLabel}</Text>
          <StepperNumberInput
            valueText={minFanInput}
            onChangeText={onMinFanInputChange}
            onBlur={onMinFanBlur}
            onIncrement={onMinFanIncrement}
            onDecrement={onMinFanDecrement}
            placeholder={`${MIN_FAN_MIN}-${MIN_FAN_MAX}`}
            editable={!disabled}
            hasError={Boolean(minFanError)}
          />
          <Text style={styles.helperText}>{labels.twThresholdHelp}</Text>
          {minFanError ? <Text style={styles.inlineErrorText}>{minFanError}</Text> : null}
        </View>
      ) : null}

      {mode === 'PMA' ? <Text style={styles.helperText}>{labels.pmaDescription}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1_5,
  },
  blockSpacing: {
    marginTop: GRID.x1_5,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: GRID.x1,
  },
  helperText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  helperTextSubLine: {
    marginTop: 6,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
});

export default ScoringSection;
