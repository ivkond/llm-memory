export interface ProjectData {
  name: string;
  git_remote: string;
  description?: string;
}

export class Project {
  constructor(
    public readonly name: string,
    public readonly gitRemote: string,
    public readonly description: string,
  ) {}

  static fromData(data: ProjectData): Project {
    return new Project(
      data.name,
      data.git_remote,
      data.description ?? '',
    );
  }

  toData(): ProjectData {
    return {
      name: this.name,
      git_remote: this.gitRemote,
      description: this.description,
    };
  }
}
