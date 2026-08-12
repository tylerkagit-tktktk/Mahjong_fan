import { Ref } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import AppText from '../../../components/AppText';
import Card from '../../../components/Card';
import TextField from '../../../components/TextField';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  titleError: string | null;
  titleInputRef: Ref<TextInput>;
  hostName: string;
  hostNameLabel: string;
  hostNamePlaceholder: string;
  hostNameError: string | null;
  disabled: boolean;
  onTitleChange: (value: string) => void;
  onHostNameChange: (value: string) => void;
};

function MultiplayerPreRoomSetup({
  title,
  titleLabel,
  titlePlaceholder,
  titleError,
  titleInputRef,
  hostName,
  hostNameLabel,
  hostNamePlaceholder,
  hostNameError,
  disabled,
  onTitleChange,
  onHostNameChange,
}: Props) {
  return (
    <View testID="new-game-multiplayer-pre-room">
      <Card style={styles.card}>
        <TextField
          label={titleLabel}
          inputRef={titleInputRef}
          value={title}
          onChangeText={onTitleChange}
          placeholder={titlePlaceholder}
          editable={!disabled}
          testID="new-game-multiplayer-title"
          accessibilityLabel={titleLabel}
        />
        {titleError ? <AppText style={styles.errorText}>{titleError}</AppText> : null}
      </Card>

      <Card style={styles.card}>
        <TextField
          label={hostNameLabel}
          value={hostName}
          onChangeText={onHostNameChange}
          placeholder={hostNamePlaceholder}
          editable={!disabled}
          maxLength={10}
          returnKeyType="done"
          testID="new-game-multiplayer-host-name"
          accessibilityLabel={hostNameLabel}
        />
        {hostNameError ? <AppText style={styles.errorText}>{hostNameError}</AppText> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  errorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
});

export default MultiplayerPreRoomSetup;
