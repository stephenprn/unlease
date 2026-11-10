/**
 * An event's pigment along its left side, the web chip's edge: a slim bar inset in the box, since
 * the native continuous corner draws a border of one colour all round, never one side apart.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

function EventEdgeComponent({ color }: { color: string }) {
  return <View pointerEvents="none" style={[styles.edge, { backgroundColor: color }]} />;
}

/** The room the edge takes at the box's start. */
export const EDGE_ROOM = 8;

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 2, top: 3, bottom: 3, width: 3, borderRadius: 1.5 },
});

export const EventEdge = memo(EventEdgeComponent);
