import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Text } from 'react-native';

import { colors } from '../components/theme';
import HabitsScreen from '../screens/HabitsScreen';
import ListDetailScreen from '../screens/ListDetailScreen';
import ListsScreen from '../screens/ListsScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import NotesScreen from '../screens/NotesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TaskEditorScreen from '../screens/TaskEditorScreen';
import TasksScreen from '../screens/TasksScreen';
import { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, string> = {
  Tasks: '✓',
  Habits: '◎',
  Notes: '✎',
  Lists: '☰',
  Settings: '⚙',
};

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, primary: colors.accent, text: colors.text },
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{ICONS[route.name]}</Text>,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      })}
    >
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
      <Tab.Screen name="Lists" component={ListsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="TaskEditor" component={TaskEditorScreen} options={{ title: 'Task' }} />
        <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ title: 'Note' }} />
        <Stack.Screen name="ListDetail" component={ListDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
