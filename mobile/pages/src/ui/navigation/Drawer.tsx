/**
 * Pages' drawer, in the suite's frame (`NavDrawer`): the pages' home, then the tree of pages (a
 * branch opened shows its sub-pages, each device keeping its own open branches; a page's icon stands
 * in the same column as every row's, its branch's chevron at the row's end; held down, its actions,
 * as the web tree's « + » and menu), « Nouvelle page »;
 * the bin, the settings and the Administration at the foot; the suite's other apps under them
 * (`NavDrawer`).
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { useChildPages } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { setExpanded, usePagesUiStore } from '@app/store/pagesUi';

import { AppText, Icon, Tappable } from '@shared/ui/components';
import { DrawerDivider, DrawerHeading, DrawerItem, NavDrawer } from '@shared/ui/components/NavDrawer';
import { duration, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';

/** A place the drawer can show as chosen. */
export type DrawerPlace = 'pages' | 'trash' | 'settings' | 'admin' | `page:${string}` | null;

/** How far a sub-page sits in from its parent in the tree. */
const TREE_STEP = 14;
/** The 44 twisty at a row's end reaches 52 by 48 under a finger. */
const TWISTY_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

/** A branch's chevron: down while folded, turned up once open. */
function Fold({ open, color }: { open: boolean; color: string }) {
  const turn = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    turn.value = withTiming(open ? 180 : 0, { duration: duration.short, easing: standard });
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={20} color={color} />
    </Animated.View>
  );
}

export interface DrawerProps {
  readonly open: boolean;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  /** The pages' home. */
  readonly onPages: () => void;
  readonly onPage: (id: string) => void;
  /** A page's row held down: its actions (a sub-page, a copy, the bin), as the web tree's menu. */
  readonly onPageActions: (id: string) => void;
  readonly onNewPage: () => void;
  readonly onTrash: () => void;
  readonly onSettings: () => void;
  readonly onAdmin: () => void;
}

/** A page in the tree, its sub-pages under it while its branch is open. */
const PageBranch = memo(function PageBranch({ id, depth, current, onPage, onActions }: { id: string; depth: number; current: DrawerPlace; onPage: (id: string) => void; onActions: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const page = useLibraryStore(s => s.blocks[id]);
  const children = useChildPages(id);
  const expanded = usePagesUiStore(s => s.expanded.has(id));
  if (!page) return null;
  const selected = current === `page:${id}`;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <>
      <DrawerItem
        label={title}
        selected={selected}
        onPress={() => onPage(id)}
        onLongPress={() => onActions(id)}
        // In line with every row at the top of the tree, a sub-page further in; a branch's chevron at the end.
        style={[depth > 0 ? { paddingLeft: 16 + depth * TREE_STEP } : null, children.length > 0 ? styles.withFold : null]}
        trailing={
          children.length > 0 ? (
            <Tappable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? t('Replier {title}', { title }) : t('Déplier {title}', { title })} hitSlop={TWISTY_SLOP} onPress={() => setExpanded(id, !expanded)} style={styles.twisty}>
              <Fold open={expanded} color={selected ? theme.color.onActionContainer : theme.color.inkMuted} />
            </Tappable>
          ) : null
        }
        leading={page.icon ? <AppText style={styles.pageEmoji}>{page.icon}</AppText> : <Icon name="page" size={22} color={selected ? theme.color.onActionContainer : theme.color.ink} solid={selected} />}
      />
      {expanded ? children.map(child => <PageBranch key={child} id={child} depth={depth + 1} current={current} onPage={onPage} onActions={onActions} />) : null}
    </>
  );
});

function DrawerComponent({ open, current, onClose, onPages, onPage, onPageActions, onNewPage, onTrash, onSettings, onAdmin }: DrawerProps) {
  const roots = useChildPages(null);
  return (
    <NavDrawer open={open} app="pages" onClose={onClose}>
      <DrawerItem label={t('Toutes les pages')} icon="book" selected={current === 'pages'} onPress={onPages} />
      <DrawerDivider />
      <DrawerHeading title={t('Pages')} />
      {roots.map(id => (
        <PageBranch key={id} id={id} depth={0} current={current} onPage={onPage} onActions={onPageActions} />
      ))}
      <DrawerItem label={t('Nouvelle page')} icon="plus" onPress={onNewPage} />
      <DrawerDivider />
      <DrawerItem label={t('Corbeille')} icon="trash" selected={current === 'trash'} onPress={onTrash} />
      <DrawerItem label={t('Réglages')} icon="settings" selected={current === 'settings'} onPress={onSettings} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={onAdmin} />
    </NavDrawer>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    twisty: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.chip) },
    // The chevron's target reaches the row's end, its glyph where the rows' other ends sit.
    withFold: { paddingRight: 4 },
    pageEmoji: { fontSize: 18, lineHeight: 24 },
  });

export const Drawer = memo(DrawerComponent);
