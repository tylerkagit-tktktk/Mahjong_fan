import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import theme from '../../../theme/theme';
import { GRID } from '../constants';
import { ConfirmSections } from '../types';

type Props = {
  visible: boolean;
  busy: boolean;
  sections: ConfirmSections | null;
  labels: {
    title: string;
    subtitle: string;
    sectionGame: string;
    sectionScoring: string;
    sectionPlayers: string;
    backToEdit: string;
    confirmCreate: string;
    creating: string;
  };
  onClose: () => void;
  onConfirm: () => void;
};

function CreateConfirmModal({ visible, busy, sections, labels, onClose, onConfirm }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) {
              onClose();
            }
          }}
          disabled={busy}
        />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{labels.title}</Text>
          <Text style={styles.modalSubtitle}>{labels.subtitle}</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {sections ? (
              <>
                <ModalSection title={labels.sectionGame} fields={sections.game} prefix="game" />
                <ModalSection title={labels.sectionScoring} fields={sections.scoring} prefix="scoring" />
                <ModalSection title={labels.sectionPlayers} fields={sections.players} prefix="players" />
              </>
            ) : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <AppButton label={labels.backToEdit} variant="secondary" onPress={onClose} disabled={busy} />
            <View style={styles.modalActionGap} />
            <AppButton label={busy ? labels.creating : labels.confirmCreate} onPress={onConfirm} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

type SectionProps = {
  title: string;
  fields: Array<{ label: string; value: string }>;
  prefix: string;
};

function ModalSection({ title, fields, prefix }: SectionProps) {
  return (
    <View style={styles.modalSection}>
      <Text style={styles.modalSectionTitle}>{title}</Text>
      {fields.map((field) => (
        <View key={`${prefix}-${field.label}`} style={styles.modalFieldRow}>
          <Text style={styles.modalFieldLabel}>{field.label}</Text>
          <Text style={styles.modalFieldValue}>{field.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: GRID.x2,
    paddingVertical: GRID.x3,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: GRID.x2,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalSubtitle: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  modalScroll: {
    marginTop: GRID.x2,
    maxHeight: 380,
  },
  modalScrollContent: {
    paddingBottom: GRID.x1,
  },
  modalSection: {
    marginBottom: GRID.x2,
  },
  modalSectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1,
  },
  modalFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: GRID.x1,
  },
  modalFieldLabel: {
    width: 112,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  modalFieldValue: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: GRID.x1_5,
  },
  modalActionGap: {
    height: GRID.x1,
  },
});

export default CreateConfirmModal;
