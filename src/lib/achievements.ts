import {
  AchievementDescription,
  gsi1PartitionKey,
  gsi1SortKey,
  gsi3PartitionKey,
  gsi3SortKey,
  NotificationFactory,
  NotificationType,
  UserAchievement,
  UserAchievementFactory,
} from '@internal-tech-solutions/sig-dynamo-factory';
import { DateTime } from 'luxon';

import { LoggerFactory } from './loggerFactory';

const { tableName = '' } = process.env;

const logger = LoggerFactory.getLogger();

export const generateUpdateParams = (
  userId: string,
  achievement: AchievementDescription | UserAchievement,
  isEarned: boolean,
  timestamp = DateTime.utc().toISO(),
) => ({
  TableName: tableName!,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Key: UserAchievementFactory.getPrimaryKey(userId, achievement.achievementId) as any,
  UpdateExpression:
    'SET #gsi1pk = :gsi1pk, ' +
    '#gsi1sk = :gsi1sk, ' +
    '#gsi3pk = :gsi3pk, ' +
    '#gsi3sk = :gsi3sk, ' +
    '#achievementId = :achievementId, ' +
    '#achievementType = :achievementType, ' +
    '#category = :category, ' +
    '#description = :description, ' +
    '#imageFileName = :imageFileName, ' +
    '#title = :title, ' +
    '#requirements = :requirements, ' +
    '#userId = :userId, ' +
    '#progress = :progress, ' +
    '#isEarned = :isEarned, ' +
    '#createdAt = :createdAt, ' +
    '#updatedAt = :updatedAt, ' +
    '#type = :type' +
    `${isEarned ? ', #earnedOn = :earnedOn' : ''}`,
  ExpressionAttributeNames: {
    '#gsi1pk': gsi1PartitionKey,
    '#gsi1sk': gsi1SortKey,
    '#gsi3pk': gsi3PartitionKey,
    '#gsi3sk': gsi3SortKey,
    '#achievementId': 'achievementId',
    '#achievementType': 'achievementType',
    '#category': 'category',
    '#description': 'description',
    '#imageFileName': 'imageFileName',
    '#title': 'title',
    '#requirements': 'requirements',
    '#userId': 'userId',
    '#progress': 'progress',
    '#isEarned': 'isEarned',
    '#createdAt': 'createdAt',
    '#updatedAt': 'updatedAt',
    '#type': 'type',
    ...(isEarned && { '#earnedOn': 'earnedOn' }),
  },
  ExpressionAttributeValues: {
    ':gsi1pk': UserAchievementFactory.getGsi1PartitionKey(userId, achievement.category)[gsi1PartitionKey],
    ':gsi1sk': UserAchievementFactory.getGsi1SortKey(achievement.achievementId, isEarned ?? false)[gsi1SortKey],
    ':gsi3pk': UserAchievementFactory.getGsi3PartitionKey(userId)[gsi3PartitionKey],
    ':gsi3sk': UserAchievementFactory.getGsi3SortKey(timestamp)[gsi3SortKey],
    ':achievementId': achievement.achievementId,
    ':achievementType': achievement.achievementType,
    ':category': achievement.category,
    ':description': achievement.description,
    ':imageFileName': achievement.imageFileName,
    ':title': achievement.title,
    ':requirements': achievement.requirements,
    ':userId': userId,
    ':progress': isEarned ? achievement.requirements : (achievement as UserAchievement).progress,
    ':isEarned': isEarned,
    ':createdAt': achievement.createdAt ?? timestamp,
    ':updatedAt': timestamp,
    ':type': UserAchievementFactory.type,
    ...(isEarned && { ':earnedOn': timestamp }),
  },
});

export const updateUnearnedAchievementProgress = (
  userId: string,
  unearnedAchievement: AchievementDescription | UserAchievement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progressAttributeValues: any,
) => {
  const updateParams = generateUpdateParams(
    userId,
    {
      ...unearnedAchievement,
      progress: {
        ...progressAttributeValues,
      },
    } as UserAchievement,
    false,
  );
  logger.debug('updateParams', JSON.stringify(updateParams, null, 2));
  return updateParams;
};

export const updateEarnedUserAchievement = (userId: string, earnedAchievement: AchievementDescription | UserAchievement) => {
  const updateParams = generateUpdateParams(userId, earnedAchievement, true);
  logger.debug('updateParams', JSON.stringify(updateParams, null, 2));

  return updateParams;
};

export const createAchievementNotification = (
  userId: string,
  notificationType: NotificationType,
  achievementTitle: string,
  notificationMessage: string,
) => ({
  TableName: tableName!,
  Item: NotificationFactory.buildItem({
    userId,
    notificationType,
    content: `You ${notificationMessage} the ${achievementTitle} achievement!`,
  }),
});
