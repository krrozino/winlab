using System;

namespace WinLab.Contracts.RegistryServices
{
    public enum UserProfileStatus
    {
        ActiveSession,
        OfflineProfileReady,
        NotCreated,
        Inaccessible
    }

    public interface IUserHiveScope : IDisposable
    {
        string UserSid { get; }
        string RootPath { get; }
        bool IsAvailable { get; }
        bool WasLoadedFromDisk { get; }
        UserProfileStatus ProfileStatus { get; }
        string? ErrorMessage { get; }
    }

    public interface IUserHiveManager
    {
        IUserHiveScope OpenUserHive(string? userSid);
        bool IsUserLoggedOn(string? userSid);
        string? GetUserProfilePath(string? userSid);
        bool IsUserAdministrator(string? userSid);
    }
}
